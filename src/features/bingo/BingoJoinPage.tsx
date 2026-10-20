import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Field } from '../../components/ui/Field';
import { Panel } from '../../components/ui/Panel';
import { useAuth } from '../auth/useAuth';
import { useMyProfile } from '../entry/entryData';
import { BingoPage } from './BingoPage';
import { bingoError, saveJoinProfile, useRedeemCode, type BingoStatus } from './bingoData';

/**
 * `/b`: join with the invite code (D-115). The Welcome Test: what this is, in plain words, before
 * anything is asked; then a saved account, a name and 18+, and the code. Nothing costs money here.
 */
export default function BingoJoinPage({ status }: { status: BingoStatus }) {
  const { user } = useAuth();
  const profile = useMyProfile(user?.uid);
  const redeem = useRedeemCode();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const guest = !user || user.isAnonymous;
  const existing = profile.data
    ? { id: profile.data.id, hasAge: Boolean(profile.data.data.ageAttestedAt) }
    : null;
  const needsName = !existing;
  const needsAge = !existing?.hasAge;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsName && !name.trim()) return setError('Add your name, the way people know you.');
    if (needsAge && !adult) return setError('Confirm you’re 18 or older to join.');
    if (!code.trim()) return setError('Type the code you were given.');
    setSaving(true);
    try {
      await saveJoinProfile({ uid: user!.uid, existing, displayName: name.trim().slice(0, 60) });
      await redeem.mutateAsync({ code });
      navigate('/b/cards');
    } catch (err) {
      setError(bingoError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BingoPage title="Weekly 649 Bingo" status={status}>
      <Panel title="What this is">
        <div className="flex flex-col gap-2 text-body">
          <p>
            Pick six numbers from 1 to 49. Each Wednesday's Lotto 6/49 draw crosses off any of yours
            that come up.
          </p>
          <p>
            The first card with all six crossed off wins the pot. If two or more finish the same
            night, they split it.
          </p>
          <p>
            A card is paid for one draw at a time, cash at the shop or e-Transfer. Nothing is paid
            on this page.
          </p>
          <Link to="/b/rules" className="min-h-touch self-start underline">
            Read the rules and the odds
          </Link>
        </div>
      </Panel>

      {guest ? (
        <Panel title="First, save your account">
          <p className="text-body">
            Bingo needs a saved account, so your cards are still here next month. It takes a minute
            with Google or your email.
          </p>
          <Link to="/account" className="btn btn-primary mt-4 w-full">
            Save my account
          </Link>
        </Panel>
      ) : (
        <Panel title="Join with your code">
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {needsName ? (
              <Field
                label="Your name"
                hint="First name and last initial is fine. It shows if you win."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={60}
              />
            ) : null}
            {needsAge ? (
              <Checkbox
                label="I'm 18 or older"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
              />
            ) : null}
            <Field
              label="Invite code"
              hint="From whoever invited you. Spaces and dashes don't matter."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            {error ? (
              <p role="alert" className="text-body font-semibold text-ink-urgent">
                <span aria-hidden="true">⚠ </span>
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? 'Joining…' : 'Join bingo'}
            </Button>
          </form>
        </Panel>
      )}
    </BingoPage>
  );
}
