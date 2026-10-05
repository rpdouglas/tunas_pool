import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Panel } from '../../components/ui/Panel';
import { useGuestSession } from '../auth/useAuth';
import { useCurrentWeek, useMyEntry, usePoolConfig, type SubmitResult } from './entryData';
import { clearDraft } from './draft';
import { EntryForm } from './EntryForm';
import { Receipt } from './Receipt';

/** Re-render every 15 seconds so the page flips to the locked state at the lock time. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export default function EntryPage() {
  const { year = '', weekId = '' } = useParams();
  const session = useGuestSession();
  const uid = session.user?.uid;
  const current = useCurrentWeek(year);
  const config = usePoolConfig();
  const mine = useMyEntry(year, weekId, uid);
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const week = current.data && current.data.id === weekId ? current.data : null;

  if (session.failed) {
    return (
      <GameDayPage title="Make your picks">
        <Panel>
          <p role="alert" className="text-body">
            We couldn't connect. Check your signal and refresh the page.
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  if (current.isPending || config.isPending || !uid || mine.isPending) {
    return (
      <GameDayPage title="Make your picks">
        <Panel>
          <p role="status" className="text-body">
            Loading this week…
          </p>
        </Panel>
      </GameDayPage>
    );
  }
  if (current.isError || mine.isError || config.isError || !week) {
    return (
      <GameDayPage title="Make your picks">
        <Panel>
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-body">
              {current.isError || mine.isError || config.isError
                ? "This week didn't load. Check your signal and refresh the page."
                : "This week isn't open for picks."}
            </p>
            <Link to="/" className="btn btn-primary">
              Back to this week
            </Link>
          </div>
        </Panel>
      </GameDayPage>
    );
  }

  const open = week.status === 'open' && now < week.lockAtMs;
  const data = mine.data!;
  const hasEntry = Boolean(data.entry);
  const title = `Week ${week.weekNumber}`;

  if (open && (!hasEntry || editing)) {
    return (
      <main className="bg-gameday min-h-screen">
        <h1 className="px-4 pt-4 text-center font-heading text-h2 italic text-ink-inverse">
          {hasEntry ? `Edit your week ${week.weekNumber} picks` : `Week ${week.weekNumber} picks`}
        </h1>
        <EntryForm
          year={year}
          week={week}
          uid={uid}
          mine={data}
          config={config.data!}
          onSubmitted={(_: SubmitResult) => {
            setEditing(false);
            setJustSubmitted(true);
            window.scrollTo({ top: 0 });
          }}
          onCancel={
            hasEntry
              ? () => {
                  clearDraft(year, week.id);
                  setEditing(false);
                }
              : undefined
          }
        />
      </main>
    );
  }

  if (!hasEntry) {
    return (
      <GameDayPage title={title}>
        <Panel>
          <div className="flex flex-col gap-3">
            <p className="text-body">
              Picks are locked, and you didn't enter this week. See you next week!
            </p>
            <Link to={`/week/${year}/${week.id}`} className="btn btn-secondary">
              Standings and everyone's picks
            </Link>
            <Link to="/" className="btn btn-primary">
              Back to this week
            </Link>
          </div>
        </Panel>
      </GameDayPage>
    );
  }

  return (
    <GameDayPage title={title}>
      <Receipt
        year={year}
        week={week}
        mine={data}
        open={open}
        isGuest={Boolean(session.user?.isAnonymous)}
        justSubmitted={justSubmitted}
        onEdit={() => {
          setJustSubmitted(false);
          setEditing(true);
        }}
      />
      {!open && (
        <Link to={`/week/${year}/${week.id}`} className="btn btn-secondary">
          Standings and everyone's picks
        </Link>
      )}
    </GameDayPage>
  );
}
