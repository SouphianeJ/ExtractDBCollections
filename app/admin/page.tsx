import ExtractorForm, { MongoUriOption } from '../../components/ExtractorForm';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default function AdminHomePage() {
  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <div className="space-y-6">
      <p className="text-base text-gray-700">
        Utilisez l&apos;outil ci-dessous pour extraire les collections MongoDB et les télécharger sous forme de
        fichiers JSON ou ZIP.
      </p>
      <ExtractorForm preconfiguredOptions={preconfiguredOptions} />
    </div>
  );
}
