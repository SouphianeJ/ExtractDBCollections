import { redirect } from 'next/navigation';

import LoginForm from '../../components/LoginForm';
import { getAdminSession } from '../../src/lib/auth/session';

export default async function LoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  return (
    <div className="login-page">
      <div className="login-page__accent login-page__accent--one" aria-hidden="true" />
      <div className="login-page__accent login-page__accent--two" aria-hidden="true" />
      <div className="login-page__beam" aria-hidden="true" />
      <LoginForm />
    </div>
  );
}
