import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import ViewPageClient from './ViewPageClient';
import { getAdminSession } from '../../src/lib/auth/session';

export default async function ViewPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/view');
  }

  return (
    <Suspense
      fallback={
        <main className="page view-page">
          <div className="container">
            <div className="loading-state">Loading collection previews…</div>
          </div>
        </main>
      }
    >
      <ViewPageClient />
    </Suspense>
  );
}
