import { redirect } from 'next/navigation';

import { getAdminSession } from '../src/lib/auth/session';

export default async function HomePage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  redirect('/login');
}
