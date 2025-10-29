import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAdminSession } from '../src/lib/auth/session';

export default async function HomePage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  return (
    <main className="page home-page">
      <div className="container">
        <div className="header">
          <h1>MongoDB Collection Tools</h1>
          <p>Connect to your database to extract, preview, or search collections.</p>
        </div>

        <div className="home-actions">
          <Link className="primary-button" href="/login">
            Go to extractor
          </Link>
          <Link className="secondary-button" href="/search">
            Search collections
          </Link>
        </div>

        <p className="home-help-text">
          You&apos;ll be prompted to sign in before accessing admin features or searching your collections.
        </p>
      </div>
    </main>
  );
}
