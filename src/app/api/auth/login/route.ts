import { NextResponse } from 'next/server';

import { createAdminSessionCookie } from '@/lib/auth/session';

type LoginRequest = {
  identifier?: string;
  password?: string;
  remember?: boolean;
};

function parseBody(body: LoginRequest) {
  return {
    identifier: typeof body.identifier === 'string' ? body.identifier.trim() : '',
    password: typeof body.password === 'string' ? body.password : '',
    remember: Boolean(body.remember)
  };
}

export async function POST(request: Request) {
  const adminIdentifier = (process.env.ADMIN_IDENTIFIER ?? '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';

  if (!adminIdentifier || !adminPassword) {
    return NextResponse.json(
      { error: 'Authentication is not configured on this server.' },
      { status: 500 }
    );
  }

  let payload: LoginRequest;

  try {
    payload = (await request.json()) as LoginRequest;
  } catch (error) {
    console.error('Invalid login payload', error);
    return NextResponse.json({ error: 'Invalid login payload.' }, { status: 400 });
  }

  const { identifier, password, remember } = parseBody(payload);

  if (!identifier || !password) {
    return NextResponse.json(
      { error: 'Identifiant et mot de passe sont requis.' },
      { status: 400 }
    );
  }

  if (identifier !== adminIdentifier || password !== adminPassword) {
    return NextResponse.json(
      { error: 'Identifiants incorrects. Merci de réessayer.' },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });

  try {
    const sessionCookie = await createAdminSessionCookie(remember);
    response.cookies.set(sessionCookie);
  } catch (error) {
    console.error('Failed to issue admin session', error);
    return NextResponse.json({ error: 'Unable to create session.' }, { status: 500 });
  }

  return response;
}
