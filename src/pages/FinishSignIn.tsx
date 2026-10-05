import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GameDayPage } from '../components/layout/GameDayPage';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import {
  finishSignIn,
  isEmailLink,
  isValidEmail,
  safeNext,
  savedEmail,
  type FinishResult,
} from '../features/auth/emailLink';
import { useAuth } from '../features/auth/useAuth';

type Phase =
  | { kind: 'working' }
  | { kind: 'ask_email' } // opened on a different phone or browser
  | { kind: 'bad_link' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: FinishResult };

const DONE_COPY: Record<FinishResult['kind'], string> = {
  linked: 'Your picks are saved to this email. Open the pool on any phone and sign in with it.',
  moved: "You're signed in, and the picks from this phone are now on your account.",
  signed_in: "You're signed in.",
  needs_admin:
    "You're signed in. Your account and this phone both have picks, so ask the pool admin to combine them. Nothing is lost.",
  resent:
    'This email already has an account, so we sent you a fresh link. Open the new email to finish.',
};

export default function FinishSignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { ready } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'working' });
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const started = useRef(false);

  async function run(address: string) {
    setPhase({ kind: 'working' });
    try {
      const result = await finishSignIn(address, window.location.href);
      setPhase({ kind: 'done', result });
    } catch {
      setPhase({
        kind: 'error',
        message:
          'That link has expired or was already used. Ask for a new one and open it on this phone.',
      });
    }
  }

  useEffect(() => {
    // Wait for Firebase to restore the guest session, so a guest is upgraded rather than replaced.
    if (!ready || started.current) return;
    started.current = true;
    if (!isEmailLink(window.location.href)) {
      setPhase({ kind: 'bad_link' });
      return;
    }
    const remembered = savedEmail();
    if (remembered) void run(remembered);
    else setPhase({ kind: 'ask_email' });
  }, [ready]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError('Enter the email address the link was sent to.');
      return;
    }
    setEmailError(undefined);
    void run(email.trim());
  }

  return (
    <GameDayPage title="Signing in">
      <Panel>
        {phase.kind === 'working' && (
          <p role="status" className="text-body">
            Finishing sign-in…
          </p>
        )}

        {phase.kind === 'ask_email' && (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <p className="font-heading text-h3">Finish on this phone</p>
            <p className="text-body">
              This link was opened on a different phone or browser than the one you asked from. For
              your safety, type the email address it was sent to.
            </p>
            <p className="text-body">
              Picks made as a guest on the other phone stay there. To bring them along, ask for a
              new link on that phone.
            </p>
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
            />
            <Button type="submit" variant="primary">
              Finish signing in
            </Button>
          </form>
        )}

        {phase.kind === 'bad_link' && (
          <div className="flex flex-col gap-4">
            <p className="text-body">This isn't a sign-in link. Ask for a new one.</p>
            <Link to="/account" className="btn btn-primary">
              Get a new link
            </Link>
          </div>
        )}

        {phase.kind === 'error' && (
          <div role="alert" className="flex flex-col gap-4">
            <p className="text-body">{phase.message}</p>
            <Link to="/account" className="btn btn-primary">
              Get a new link
            </Link>
          </div>
        )}

        {phase.kind === 'done' && (
          <div role="status" className="flex flex-col gap-4">
            <p className="text-body">{DONE_COPY[phase.result.kind]}</p>
            {phase.result.kind !== 'resent' && (
              <Link to={next} className="btn btn-primary">
                Continue
              </Link>
            )}
          </div>
        )}
      </Panel>
    </GameDayPage>
  );
}
