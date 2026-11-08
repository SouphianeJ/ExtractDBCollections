import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSession,
  destroyAdminSession,
  getAdminSession
} from '../../../../src/lib/auth/session';

export const runtime = 'nodejs';

function getAction(params: { nextauth?: string[] }): string | undefined {
  const [action] = params.nextauth ?? [];
  return action;
}

function getAdminCredentials(): { identifier: string; password: string } | null {
  const identifier = process.env.ADMIN_IDENTIFIER;
  const password = process.env.ADMIN_PASSWORD;

  if (!identifier || !password) {
    return null;
  }

  return { identifier, password };
}

const MAX_LOGIN_ATTEMPTS = 5;
const MAX_GLOBAL_FAILED_ATTEMPTS = 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;
const GLOBAL_KEY = '*';
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request): string {
  // x-forwarded-for est fourni par le client : seule la dernière entrée (ajoutée par le proxy le plus
  // proche) est fiable, et seulement derrière un reverse proxy maîtrisé. Le plafond global couvre le reste.
  return request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
}

function isOverLimit(key: string, max: number, now: number): boolean {
  const entry = loginAttempts.get(key);
  return Boolean(entry && entry.resetAt > now && entry.count >= max);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  return isOverLimit(GLOBAL_KEY, MAX_GLOBAL_FAILED_ATTEMPTS, now) || isOverLimit(key, MAX_LOGIN_ATTEMPTS, now);
}

function incrementAttempts(key: string, now: number): void {
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  if (loginAttempts.size >= MAX_TRACKED_CLIENTS) {
    loginAttempts.forEach((entry, storedKey) => {
      if (entry.resetAt <= now) {
        loginAttempts.delete(storedKey);
      }
    });
  }
  incrementAttempts(GLOBAL_KEY, now);
  if (loginAttempts.has(key) || loginAttempts.size < MAX_TRACKED_CLIENTS) {
    incrementAttempts(key, now);
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function isBooleanString(value: unknown): value is 'true' | 'false' {
  return value === 'true' || value === 'false';
}

export async function POST(request: Request, { params }: { params: { nextauth?: string[] } }) {
  const action = getAction(params);

  if (action === 'login') {
    return handleLogin(request);
  }

  if (action === 'logout') {
    return handleLogout();
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(_request: Request, { params }: { params: { nextauth?: string[] } }) {
  const action = getAction(params);

  if (action === 'session') {
    return handleSession();
  }

  if (action === 'csrf') {
    return NextResponse.json({ csrfToken: null }, { status: 200 });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

async function handleLogin(request: Request) {
  const clientKey = getClientKey(request);

  if (isRateLimited(clientKey)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const { identifier, password, rememberMe } = (await request.json()) as Partial<{
      identifier: string;
      password: string;
      rememberMe: boolean | string;
    }>;

    const trimmedIdentifier = identifier?.trim() ?? '';
    const trimmedPassword = password?.trim() ?? '';

    if (!trimmedIdentifier || !trimmedPassword) {
      return NextResponse.json(
        { error: 'Identifier and password are required.' },
        { status: 400 }
      );
    }

    const credentials = getAdminCredentials();

    if (!credentials) {
      return NextResponse.json(
        { error: 'Admin credentials are not configured on the server.' },
        { status: 500 }
      );
    }

    const identifierMatches = safeEqual(trimmedIdentifier, credentials.identifier);
    const passwordMatches = safeEqual(trimmedPassword, credentials.password);

    if (!identifierMatches || !passwordMatches) {
      recordFailedAttempt(clientKey);
      console.warn('Failed admin login attempt from', clientKey);
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    loginAttempts.delete(clientKey);

    const rememberFlag =
      typeof rememberMe === 'boolean'
        ? rememberMe
        : isBooleanString(rememberMe)
        ? rememberMe === 'true'
        : false;

    await createAdminSession(rememberFlag);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to process login request:', error);
    return NextResponse.json({ error: 'Unable to process login.' }, { status: 500 });
  }
}

async function handleLogout() {
  destroyAdminSession();
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.delete({ name: ADMIN_SESSION_COOKIE_NAME, path: '/' });
  return response;
}

async function handleSession() {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      authenticated: true,
      session: {
        rememberMe: session.rememberMe,
        expiresAt: session.expiresAt.toISOString()
      }
    },
    { status: 200 }
  );
}
