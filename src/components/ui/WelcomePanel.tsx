import { Link } from 'react-router-dom';
import { Panel } from './Panel';

export interface WelcomePanelProps {
  /** "$20". */
  fee: string;
  /** When picks lock, in words, while a week is open; otherwise null. */
  lockLabel: string | null;
  /** Signed in with Google or email already: no "Sign in" offer. */
  signedIn: boolean;
  onDismiss: () => void;
}

/**
 * The welcome for someone new (D-101): what the pool is, in three plain lines, and that no account
 * is needed to play. Shown on the home screen to visitors with no profile yet, never to regulars,
 * so nobody taps past it on a Saturday night (PERSONAS: the Welcome Test and the Dale Deadline Test).
 */
export function WelcomePanel({ fee, lockLabel, signedIn, onDismiss }: WelcomePanelProps) {
  return (
    <Panel title="Welcome to the pool">
      <div className="flex flex-col gap-3 text-body">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Pick the winner of every game this week, plus a guess at the Monday night total.</li>
          <li>The entry is {fee}, cash or e-Transfer. Most correct picks wins the pot.</li>
          <li>
            Nobody sees anyone's picks until they lock
            {lockLabel ? <>, {lockLabel}</> : null}. Only your name shows to other players.
          </li>
        </ul>
        <p>
          <strong>No account needed.</strong>{' '}
          {lockLabel
            ? 'Make your picks below.'
            : "This week's picks are locked, so come back when the next week opens."}{' '}
          You can save an account later to use another phone.
        </p>
        {!signedIn && (
          <Link
            to="/account"
            className="inline-flex min-h-touch items-center text-ink-emphasis underline"
          >
            Already play? Sign in with Google or email
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-touch items-center self-start text-ink-muted underline"
        >
          Got it, hide this
        </button>
      </div>
    </Panel>
  );
}
