import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { isValidEmail, sendSignInLink } from './emailLink';

/** Ask for an email and send a sign-in link. Shared by the player and admin sign-in screens. */
export function EmailLinkForm({
  next,
  buttonLabel = 'Email me a link',
}: {
  next: string;
  buttonLabel?: string;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError('Enter an email address, like name@example.com.');
      return;
    }
    setError(undefined);
    setSending(true);
    try {
      await sendSignInLink(email, next);
      setSentTo(email.trim());
    } catch {
      setError("The link didn't send. Check the address and try again.");
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="font-heading text-h3">Check your email</p>
        <p className="text-body">
          We sent a link to <strong>{sentTo}</strong>. Open it on this phone to finish. It can take
          a minute to arrive, so check your junk folder too.
        </p>
        <Button variant="ghost" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <Button type="submit" variant="primary" disabled={sending}>
        {sending ? 'Sending…' : buttonLabel}
      </Button>
    </form>
  );
}
