import type { ReactNode } from 'react';

import LogoutButton from '@/components/LogoutButton';
import { requireAdminSession } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__content">
          <div className="admin-header__titles">
            <h1>MongoDB Collection Extractor</h1>
            <p>Connecté en tant que {session.identifier}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
