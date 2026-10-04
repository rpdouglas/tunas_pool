import { Panel } from '../components/ui/Panel';

/** Back Office shell placeholder. Real admin lands in Sprint 3 (docs/PROJECT_PLAN.md). */
export default function AdminHome() {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-8">
      <div className="mx-auto max-w-backoffice">
        <Panel title="Back Office">
          <p className="text-body text-ink-muted">
            The payments queue, week setup, and results screens arrive in Sprint 3.
          </p>
        </Panel>
      </div>
    </main>
  );
}
