import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { parseClaimRequest } from '@shared/claims';
import { formatPhone } from '@shared/phone';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { friendlyError } from '../../lib/errors';
import { EmailLinkForm } from '../auth/EmailLinkForm';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { useGuestSession } from '../auth/useAuth';
import { useMyClaims, useMyProfile, useRequestClaim, type MyClaim } from './claimsData';

const TITLE = 'Played before?';

/**
 * "I've played before" (PROJECT_PLAN Sprint 5): a player who has been entered on paper, by text,
 * or by phone asks to link that history to their login. A person at the pool checks every request
 * (D-004). Asking shows nothing about anyone's profile, matched or not (PERSONAS anti-persona E).
 */
export default function ClaimPage() {
  const session = useGuestSession();
  const uid = session.user?.uid;
  const profile = useMyProfile(uid);
  const claims = useMyClaims(uid);

  if (session.failed || profile.isError || claims.isError) {
    return (
      <GameDayPage title={TITLE}>
        <Panel>
          <p role="alert" className="text-body">
            This page didn't load. Check your signal and refresh.
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  if (!session.user || profile.isPending || claims.isPending) {
    return (
      <GameDayPage title={TITLE}>
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      </GameDayPage>
    );
  }

  const latest = claims.data[0] ?? null;
  return (
    <GameDayPage title={TITLE}>
      {profile.data?.linkedToRoster ? (
        <Panel title="You're linked">
          <div className="flex flex-col gap-4">
            <p className="text-body">
              <span aria-hidden="true">✓ </span>
              Your history is linked to this account as <strong>{profile.data.displayName}</strong>.
            </p>
            <Link to="/history" className="btn btn-primary">
              See your history
            </Link>
          </div>
        </Panel>
      ) : session.user.isAnonymous ? (
        <Panel title="First, save your account">
          <div className="flex flex-col gap-4">
            <Intro />
            <p className="text-body">
              To link your history, save your account with an email or Google first, so the link
              still works if you change phones. There's no password to remember.
            </p>
            <EmailLinkForm next="/claim" />
            <p className="text-center text-body text-ink-muted">or</p>
            <GoogleSignInButton next="/claim" />
          </div>
        </Panel>
      ) : latest?.status === 'pending' ? (
        <PendingPanel claim={latest} />
      ) : (
        <ClaimForm
          uid={session.user.uid}
          rejected={latest?.status === 'rejected' ? latest : null}
        />
      )}
      <Link
        to="/"
        className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
      >
        Back to this week
      </Link>
    </GameDayPage>
  );
}

function Intro() {
  return (
    <p className="text-body">
      If the pool has entered picks for you before, from a paper sheet, a text, or a phone call, you
      can link those weeks to this account. Then you see your whole history here and make your own
      picks online.
    </p>
  );
}

function PendingPanel({ claim }: { claim: MyClaim }) {
  return (
    <Panel title="Request sent">
      <div className="flex flex-col gap-3">
        <p>
          <StatusBadge status="pending" />
        </p>
        <p className="text-body">
          The pool has your request and a person will check it. This page updates when they do. You
          can keep making picks in the meantime.
        </p>
        <p className="text-body text-ink-muted">
          You asked as <strong>{claim.claimedName}</strong>
          {claim.claimedPhone ? `, ${formatPhone(claim.claimedPhone)}` : ''}.
        </p>
      </div>
    </Panel>
  );
}

function ClaimForm({ uid, rejected }: { uid: string; rejected: MyClaim | null }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const request = useRequestClaim(uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSendError(null);
    const parsed = parseClaimRequest({ claimedName: name, claimedPhone: phone });
    if (!parsed.ok) {
      setErrors(
        /phone/i.test(parsed.message) ? { phone: parsed.message } : { name: parsed.message },
      );
      return;
    }
    setErrors({});
    try {
      await request.mutateAsync(parsed.value);
    } catch (err) {
      setSendError(friendlyError(err));
    }
  }

  return (
    <Panel title="Link your history">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {rejected && (
          <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
            <span aria-hidden="true">ⓘ </span>
            The pool couldn't match your last request
            {rejected.decisionNote ? (
              <>
                : <strong>{rejected.decisionNote}</strong>
              </>
            ) : (
              '.'
            )}{' '}
            You can try again with the name on your sheet, or ask at the shop.
          </p>
        )}
        <Intro />
        <Field
          label="The name the pool knows you by"
          hint="The way it's written on your sheet or the leaderboard, like Rosalie M."
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
          error={errors.name}
        />
        <Field
          label="Your phone (optional)"
          hint="The number the pool has for you. It helps them be sure it's you. Other players never see it."
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setErrors((x) => ({ ...x, phone: undefined }));
          }}
          error={errors.phone}
        />
        <p className="text-body-sm text-ink-muted">
          A person at the pool checks every request before anything is linked.
        </p>
        {sendError && (
          <p role="alert" className="font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {sendError}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={request.isPending}>
          {request.isPending ? 'Sending…' : 'Ask the pool to link it'}
        </Button>
      </form>
    </Panel>
  );
}
