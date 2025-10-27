import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import LoginForm from '@/components/LoginForm';
import { getAdminSession } from '@/lib/auth/session';

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const metadata: Metadata = {
  title: 'Connexion administrateur',
  description: 'Accédez à l’interface d’administration sécurisée.'
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  const redirectPathParam = searchParams?.from;
  const rawRedirectPath = Array.isArray(redirectPathParam)
    ? redirectPathParam[0]
    : redirectPathParam;
  const redirectPath = typeof rawRedirectPath === 'string' && rawRedirectPath.startsWith('/')
    ? rawRedirectPath
    : undefined;

  return (
    <main className="page auth-page">
      <div className="auth-card">
        <h1>Connexion administrateur</h1>
        <p>Entrez vos identifiants pour accéder aux outils d’extraction.</p>
        <LoginForm redirectPath={redirectPath} />
      </div>
    </main>
  );
}
