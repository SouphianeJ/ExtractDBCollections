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

    if (
      trimmedIdentifier !== credentials.identifier ||
      trimmedPassword !== credentials.password
    ) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

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
