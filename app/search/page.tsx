import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import SearchPageClient from './SearchPageClient';
import { getAdminSession } from '../../src/lib/auth/session';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';
import type { MongoUriOption } from '../../components/ExtractorForm';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default async function SearchPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/search');
  }

  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <Suspense
      fallback={
        <main className="page search-page">
          <div className="container">
            <div className="loading-state">Preparing search tools…</div>
          </div>
        </main>
      }
    >
      <SearchPageClient preconfiguredOptions={preconfiguredOptions} />
    </Suspense>
  );
}
