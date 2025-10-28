import { ReactNode } from 'react';

import LogoutButton from '../../components/LogoutButton';
import { requireAdminSession } from '../../src/lib/auth/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();
  const formattedExpiration = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(session.expiresAt);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <div className="admin-header__intro">
            <span className="admin-header__badge">
              <span className="status-indicator status-indicator--info" aria-hidden="true" />
              Accès administrateur
            </span>
            <h1 className="admin-header__title">Espace administrateur</h1>
            <p className="admin-header__description">
              Accédez aux outils d&apos;extraction MongoDB, exportez vos collections et suivez les opérations essentielles en toute
              sérénité.
            </p>
          </div>
          <div className="admin-session">
            <div className="admin-session__status">
              <span className="status-indicator status-indicator--success" aria-hidden="true" />
              Connecté — {session.rememberMe ? 'session prolongée active' : 'session courte active'}
            </div>
            <dl className="admin-session__meta">
              <dt>Expiration de la session</dt>
              <dd>{formattedExpiration}</dd>
            </dl>
            <div className="admin-session__controls">
              <span className="admin-session__security">Cookies httpOnly activés</span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="admin-main">
        <div className="admin-main__card">{children}</div>
      </main>
    </div>
  );
}
