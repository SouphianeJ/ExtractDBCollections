import { redirect } from 'next/navigation';

import SearchPageClient from './SearchPageClient';
import { getAdminSession } from '../../src/lib/auth/session';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';

type MongoUriOption = { id: string; name: string };

function mapToOption(option: MongoUriOption): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default async function SearchPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/search');
  }

  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <main className="page search-page">
      <div className="container">
        <SearchPageClient preconfiguredOptions={preconfiguredOptions} />
      </div>
    </main>
  );
}
