import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Told about the error, for reporting. */
  onError?: (error: Error) => void;
}

/**
 * The last line of defence: if a screen throws while drawing, show a plain message and a way out
 * instead of a blank page (DESIGN_SYSTEM §8: say what happened and how to fix it). Picks typed so
 * far are safe: the entry form saves them on the device from the first tap.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="bg-gameday min-h-screen px-4 pb-16 pt-8">
        <div className="mx-auto flex max-w-player flex-col gap-4">
          <div role="alert" className="panel">
            <h1 className="panel-title">Something went wrong</h1>
            <div className="flex flex-col gap-4 p-4">
              <p className="text-body">
                This screen hit a problem and couldn't finish loading. Picks you were making are
                still saved on this phone.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload the page
              </button>
              <a href="/" className="btn btn-ghost">
                Back to this week
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }
}
