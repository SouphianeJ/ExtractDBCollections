import ExtractorForm, { MongoUriOption } from '../components/ExtractorForm';
import PasswordGate from '../components/PasswordGate';
import { getPreconfiguredMongoUris } from '../lib/preconfiguredMongoUris';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default function HomePage() {
  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <PasswordGate>
      <ExtractorForm preconfiguredOptions={preconfiguredOptions} />
    </PasswordGate>
  );
}
