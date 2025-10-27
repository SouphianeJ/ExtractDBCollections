import { redirect } from 'next/navigation';

import LoginForm from '../../components/LoginForm';
import { getAdminSession } from '../../src/lib/auth/session';

export default async function LoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-100 via-slate-50 to-blue-100 px-4 py-16">
      <div className="pointer-events-none absolute -left-1/3 top-16 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-1/4 bottom-8 h-[420px] w-[420px] rounded-full bg-sky-200/50 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-32 max-w-xl bg-gradient-to-b from-white/70 to-transparent" aria-hidden="true" />
      <LoginForm />
    </div>
  );
}
