import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const SESSION_COOKIE_NAME = 'admin-session';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const LONG_LIVED_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AdminSession {
  rememberMe: boolean;
  expiresAt: Date;
}

function getSigningSecret(): Uint8Array {
  const identifier = process.env.ADMIN_IDENTIFIER;
  const password = process.env.ADMIN_PASSWORD;

  if (!identifier || !password) {
    throw new Error('ADMIN_IDENTIFIER and ADMIN_PASSWORD must be configured');
  }

  const encoder = new TextEncoder();
  return encoder.encode(`${identifier}:${password}`);
}

function getMaxAge(rememberMe: boolean): number {
  return rememberMe ? LONG_LIVED_MAX_AGE_SECONDS : DEFAULT_MAX_AGE_SECONDS;
}

async function verifyToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningSecret(), {
      algorithms: ['HS256']
    });

    return buildSessionFromPayload(payload);
  } catch (error) {
    console.warn('Failed to verify admin session token:', error);
    return null;
  }
}

function buildSessionFromPayload(payload: JWTPayload): AdminSession | null {
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;

  if (!exp) {
    return null;
  }

  return {
    rememberMe: payload.rememberMe === true,
    expiresAt: new Date(exp * 1000)
  };
}

export async function createAdminSession(rememberMe: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = getMaxAge(rememberMe);
  const expiresAt = now + maxAge;

  const token = await new SignJWT({
    rememberMe
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setSubject('admin')
    .sign(getSigningSecret());

  const cookieStore = cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    expires: new Date(expiresAt * 1000)
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login');
  }

  return session;
}

export function destroyAdminSession(): void {
  cookies().delete({ name: SESSION_COOKIE_NAME, path: '/' });
}

export async function isValidAdminSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  const session = await verifyToken(token);
  return session !== null;
}

export const ADMIN_SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
export const LONG_SESSION_MAX_AGE = LONG_LIVED_MAX_AGE_SECONDS;
export const SHORT_SESSION_MAX_AGE = DEFAULT_MAX_AGE_SECONDS;
