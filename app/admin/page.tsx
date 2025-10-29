import Link from 'next/link';

import ExtractorForm, { MongoUriOption } from '../../components/ExtractorForm';
import { getPreconfiguredMongoUris } from '../../lib/preconfiguredMongoUris';

function mapToOption(option: { id: string; name: string }): MongoUriOption {
  return { id: option.id, name: option.name };
}

export default function AdminHomePage() {
  const preconfiguredOptions = getPreconfiguredMongoUris().map(mapToOption);

  return (
    <section className="admin-dashboard">
      <div className="admin-dashboard__actions">
        <Link className="link-button" href="/search">
          Search documents
        </Link>
      </div>
      <p className="admin-dashboard__intro">
        Utilisez l&apos;outil ci-dessous pour extraire les collections MongoDB et les télécharger sous forme de fichiers JSON ou ZIP.
      </p>
      <ExtractorForm preconfiguredOptions={preconfiguredOptions} />
    </section>
  );
}
