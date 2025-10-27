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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
              Admin
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
              Sécurisé
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Espace administrateur</h1>
            <p className="max-w-2xl text-sm text-slate-600">
              Accédez aux outils d&apos;extraction de bases MongoDB, exportez les collections et suivez vos opérations en toute
              confiance.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm text-slate-600 lg:text-right">
            <div className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-emerald-50 px-4 py-2 font-medium text-emerald-700 lg:self-end">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Connecté {session.rememberMe ? '• session prolongée' : '• session standard'}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Expiration de la session</p>
              <p className="text-sm font-semibold text-slate-700">{formattedExpiration}</p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                Cookies httpOnly activés
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-10 lg:py-12">
        <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
          {children}
        </div>
      </main>
    </div>
  );
}
