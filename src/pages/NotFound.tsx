import { Link } from 'react-router-dom';
import { TunaBadge } from '../components/ui/BrandArt';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-16 text-center">
      <TunaBadge className="mx-auto mb-4 w-36" />
      <h1 className="font-heading text-h1 text-purple-700">Page not found</h1>
      <p className="mt-2 text-body text-ink-muted">That link doesn't go anywhere.</p>
      <Link to="/" className="btn btn-secondary mt-6">
        Back to the pool
      </Link>
    </main>
  );
}
