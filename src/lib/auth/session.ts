import type { NextRequest } from 'next/server';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionPayload = {
  identifier: string;
  expiresAt: number;
  issuedAt: number;
};

export type AdminSession = SessionPayload;

const SESSION_COOKIE_NAME = 'admin_session';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getAdminIdentifier(): string | null {
  return (process.env.ADMIN_IDENTIFIER ?? '').trim() || null;
}

function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD ?? null;
}

function getSigningSecret(): string | null {
  const identifier = getAdminIdentifier();
  const password = getAdminPassword();

  if (!identifier || !password) {
    return null;
  }

  return `${identifier}:${password}`;
}

function ensureCrypto(): Crypto {
  const cryptoInstance = globalThis.crypto;

  if (!cryptoInstance || !cryptoInstance.subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }

  return cryptoInstance;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const cryptoInstance = ensureCrypto();
  const keyData = encoder.encode(secret);

  return cryptoInstance.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized.padEnd(normalized.length + paddingLength, '=');

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function encodeAndSignPayload(payload: SessionPayload, secret: string): Promise<string> {
  const cryptoInstance = ensureCrypto();
  const json = JSON.stringify(payload);
  const dataBytes = encoder.encode(json);
  const encodedPayload = toBase64Url(dataBytes.buffer);
  const key = await importHmacKey(secret);
  const signatureBuffer = await cryptoInstance.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  const signature = toBase64Url(signatureBuffer);

  return `${encodedPayload}.${signature}`;
}

async function parseSessionValue(value: string | undefined, secret: string | null): Promise<AdminSession | null> {
  if (!value || !secret) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  try {
    const cryptoInstance = ensureCrypto();
    const key = await importHmacKey(secret);
    const signatureBytes = fromBase64Url(signature);
    const isValid = await cryptoInstance.subtle.verify(
      'HMAC',
      key,
      signatureBytes.buffer as ArrayBuffer,
      encoder.encode(encodedPayload)
    );

    if (!isValid) {
      return null;
    }

    const payloadBytes = fromBase64Url(encodedPayload);
    const payload = JSON.parse(decoder.decode(payloadBytes)) as SessionPayload;
    const identifier = getAdminIdentifier();

    if (!identifier || payload.identifier !== identifier) {
      return null;
    }

    if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Failed to parse admin session cookie', error);
    return null;
  }
}

function buildCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production'
  };
}

export async function createAdminSessionCookie(remember: boolean) {
  const secret = getSigningSecret();
  const identifier = getAdminIdentifier();

  if (!secret || !identifier) {
    throw new Error('ADMIN_IDENTIFIER and ADMIN_PASSWORD must be configured.');
  }

  const maxAge = remember ? REMEMBER_MAX_AGE_SECONDS : DEFAULT_MAX_AGE_SECONDS;
  const now = Date.now();
  const payload: SessionPayload = {
    identifier,
    issuedAt: now,
    expiresAt: now + maxAge * 1000
  };

  const value = await encodeAndSignPayload(payload, secret);

  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: buildCookieOptions(maxAge)
  };
}

export function clearAdminSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    options: {
      ...buildCookieOptions(0),
      maxAge: 0,
      expires: new Date(0)
    }
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionValue(cookieValue, getSigningSecret());
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  return session!;
}

export async function getAdminSessionFromRequest(request: NextRequest): Promise<AdminSession | null> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionValue(cookieValue, getSigningSecret());
}
