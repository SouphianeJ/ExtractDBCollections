import { redirect } from 'next/navigation';

import LoginForm from '../../components/LoginForm';
import { getAdminSession } from '../../src/lib/auth/session';

export default async function LoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <LoginForm />
    </div>
  );
}
