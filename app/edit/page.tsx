import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import EditPageClient from './EditPageClient';
import { getAdminSession } from '../../src/lib/auth/session';

export default async function EditPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/edit');
  }

  return (
    <Suspense
      fallback={
        <main className="page edit-page">
          <div className="container">
            <div className="loading-state">Loading collection details…</div>
          </div>
        </main>
      }
    >
      <EditPageClient />
    </Suspense>
  );
}
