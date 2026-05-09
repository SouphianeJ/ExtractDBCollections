import { redirect } from 'next/navigation';

import ExtractorForm, { type MongoUriOption } from '../../components/ExtractorForm';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';
import { getAdminSession } from '../../src/lib/auth/session';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default async function ExtractPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login?from=/extract');
  }

  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return <ExtractorForm preconfiguredOptions={preconfiguredOptions} />;
}
