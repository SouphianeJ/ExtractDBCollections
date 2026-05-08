import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import type { MongoUriOption } from '../../components/ExtractorForm';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';
import { getAdminSession } from '../../src/lib/auth/session';
import CrudPageClient from './CrudPageClient';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default async function CrudPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/crud');
  }

  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <Suspense
      fallback={
        <main className="page crud-page">
          <div className="container">
            <div className="loading-state">Preparing CRUD workspace…</div>
          </div>
        </main>
      }
    >
      <CrudPageClient preconfiguredOptions={preconfiguredOptions} />
    </Suspense>
  );
}
