import { useState } from 'react';
import { Link } from 'react-router-dom';
import { boardAccess, boardIsOpen, canChangeMessage, HOUSE_RULES } from '@shared/board';
import { Panel } from '../../components/ui/Panel';
import type { WeekView } from '../../lib/weekModel';
import { useAuth } from '../auth/useAuth';
import { useMyProfile } from '../entry/entryData';
import { BoardComposer } from './BoardComposer';
import {
  deleteMessage,
  editMessage,
  hideMessage,
  postMessage,
  reportMessage,
  setMute,
  useBoardJoin,
  useBoardMessages,
  useBoardReports,
  useBoardStanding,
} from './boardData';
import { BoardPost } from './BoardPost';

/**
 * The weekly board (D-102): banter for the week's players. Anyone who entered reads it; paid
 * players with a saved account post; the commissioner and the counter role can hide a post or mute
 * someone for the week. The rules enforce all of it; this screen says it in words first.
 */
export function BoardSection({ year, week }: { year: string; week: WeekView }) {
  const { user, isAdmin, isCounter } = useAuth();
  const staff = isAdmin || isCounter;
  const join = useBoardJoin(user?.uid);
  const playerId = join.data ?? null;
  const standing = useBoardStanding(year, week.id, playerId);
  const profile = useMyProfile(user?.uid);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const now = Date.now();

  const open = boardIsOpen(
    {
      status: week.status,
      winnerPublishedAtMs: week.winner ? week.winner.publishedAt.toDate().getTime() : null,
    },
    now,
  );
  const access = boardAccess({
    staff,
    entered: standing.data?.entered === true,
    savedAccount: Boolean(user && !user.isAnonymous),
    paid: standing.data?.paid === true,
    muted: standing.data?.muted === true,
    open,
    picksOpen: week.status === 'open' && now < week.lockAtMs,
  });
  const ready = join.isSuccess && (!playerId || standing.isSuccess);
  const board = useBoardMessages(year, week.id, ready && access.canRead);
  const reports = useBoardReports(year, week.id, staff);
  const author =
    playerId && profile.data?.id === playerId
      ? { playerId, displayName: profile.data.data.displayName }
      : null;

  return (
    <Panel title="Board">
      <div className="flex flex-col gap-4 text-body">
        <p className="text-ink-muted">{HOUSE_RULES}</p>

        {join.isError || standing.isError ? (
          <p role="alert">The board didn't load. Check your signal and refresh.</p>
        ) : !ready ? (
          <p role="status">Loading the board…</p>
        ) : (
          <>
            {access.note && (
              <p className="rounded-md bg-surface-muted p-3">
                {access.note}{' '}
                {access.action === 'make-picks' && (
                  <Link to={`/picks/${year}/${week.id}`} className="underline">
                    Make your picks
                  </Link>
                )}
                {access.action === 'save-account' && (
                  <Link to="/account" className="underline">
                    Save your account
                  </Link>
                )}
              </p>
            )}

            {access.canPost && author && (
              <BoardComposer onPost={(text) => postMessage(year, week.id, author, text)} />
            )}

            {access.canRead &&
              (board.failed ? (
                <p role="alert">The board didn't load. Check your signal and refresh.</p>
              ) : board.loading ? (
                <p role="status">Loading the posts…</p>
              ) : board.messages.length === 0 ? (
                <p>No posts yet. Get it started.</p>
              ) : (
                <ol className="flex flex-col gap-2" aria-label="Posts, newest first">
                  {[...board.messages].reverse().map((m) => (
                    <BoardPost
                      key={m.id}
                      message={m}
                      mine={m.playerId === playerId}
                      canChange={canChangeMessage(m, playerId, access.canPost, now)}
                      canReport={Boolean(playerId) && !staff}
                      reported={reported.has(m.id)}
                      staff={staff}
                      reportCount={reports[m.id]}
                      onEdit={(text) => editMessage(year, week.id, m.id, text)}
                      onDelete={() => deleteMessage(year, week.id, m.id)}
                      onReport={async () => {
                        await reportMessage(year, week.id, m.id, playerId!);
                        setReported((prev) => new Set(prev).add(m.id));
                      }}
                      onHide={(reason) => hideMessage(year, week.id, m.id, reason)}
                      onMute={(reason) => setMute(year, week.id, m.playerId, true, reason)}
                    />
                  ))}
                </ol>
              ))}
          </>
        )}
      </div>
    </Panel>
  );
}
