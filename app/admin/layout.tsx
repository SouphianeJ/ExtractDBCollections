import { ReactNode } from 'react';

import LogoutButton from '../../components/LogoutButton';
import { requireAdminSession } from '../../src/lib/auth/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Espace administrateur</h1>
            <p className="text-sm text-gray-600">Extraire et télécharger les collections MongoDB.</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
