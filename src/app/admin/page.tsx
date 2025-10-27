import ExtractorForm, { MongoUriOption } from '@/components/ExtractorForm';
import { getPreconfiguredMongoUris } from '@/lib/preconfiguredMongoUris';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default function AdminHomePage() {
  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return <ExtractorForm preconfiguredOptions={preconfiguredOptions} />;
}
