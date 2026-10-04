import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-16 text-center">
      <h1 className="font-heading text-h1 text-purple-700">Page not found</h1>
      <p className="mt-2 text-body text-ink-muted">That link doesn't go anywhere.</p>
      <Link to="/" className="btn btn-secondary mt-6">
        Back to the pool
      </Link>
    </main>
  );
}
