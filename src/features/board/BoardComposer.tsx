import { useState, type FormEvent } from 'react';
import { checkMessage, MAX_MESSAGE_LENGTH } from '@shared/board';
import { Button } from '../../components/ui/Button';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { friendlyError } from '../../lib/errors';

/** Write a post on the weekly board (D-102). Plain text, up to 500 characters. */
export function BoardComposer({ onPost }: { onPost: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = MAX_MESSAGE_LENGTH - text.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const checked = checkMessage(text);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onPost(checked.text);
      setText('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <TextAreaField
        label="Your message"
        hint={`${left} characters left.`}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        className="min-h-24"
        error={error ?? undefined}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Posting…' : 'Post'}
      </Button>
    </form>
  );
}
