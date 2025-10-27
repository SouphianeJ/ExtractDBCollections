import { Suspense } from 'react';

import ViewPageClient from './ViewPageClient';

export default function ViewPage() {
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
