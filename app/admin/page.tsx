import Link from 'next/link';

const dashboardSections = [
  {
    title: 'Extract collections',
    description: 'Export one collection or an entire database as JSON/ZIP with the guided extractor workspace.',
    href: '/extract',
    badge: 'Export'
  },
  {
    title: 'Search documents',
    description: 'Run JSON filters or plain-text searches across discovered document fields from a dedicated page.',
    href: '/search',
    badge: 'Search'
  },
  {
    title: 'Manage documents',
    description: 'Open the CRUD workspace to create, inspect, update and delete documents in a single flow.',
    href: '/crud',
    badge: 'CRUD'
  }
] as const;

export default function AdminHomePage() {
  return (
    <section className="admin-dashboard">
      <div className="admin-dashboard__hero">
        <div className="admin-dashboard__intro-block">
          <span className="admin-dashboard__eyebrow">Dashboard</span>
          <h2 className="admin-dashboard__title">Toutes les fonctions principales sont accessibles depuis ici.</h2>
          <p className="admin-dashboard__intro">
            Naviguez directement vers l&apos;extraction, la recherche documentaire multi-champs ou la gestion CRUD sans
            repasser par des écrans intermédiaires.
          </p>
        </div>
        <div className="admin-dashboard__hero-actions">
          <Link className="link-button" href="/crud">
            Open CRUD workspace
          </Link>
          <Link className="link-button" href="/search">
            Search documents
          </Link>
        </div>
      </div>

      <div className="admin-dashboard__grid">
        {dashboardSections.map((section) => (
          <article key={section.href} className="dashboard-card">
            <span className="dashboard-card__badge">{section.badge}</span>
            <h3 className="dashboard-card__title">{section.title}</h3>
            <p className="dashboard-card__description">{section.description}</p>
            <Link className="dashboard-card__link" href={section.href}>
              Open {section.badge.toLowerCase()}
            </Link>
          </article>
        ))}
      </div>

      <div className="info-box admin-dashboard__info">
        <h3>Workflow recommandé</h3>
        <ul>
          <li>Démarrez par l&apos;extracteur pour choisir votre base et vos collections.</li>
          <li>Utilisez la recherche pour retrouver rapidement des documents avec du texte simple ou du JSON.</li>
          <li>Passez dans le CRUD pour modifier ou supprimer précisément les documents ciblés.</li>
        </ul>
      </div>
    </section>
  );
}
