import { NextResponse } from 'next/server';

import { clearAdminSessionCookie } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearAdminSessionCookie());
  return response;
}
