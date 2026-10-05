import { useInfiniteQuery } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useState } from 'react';
import { describeAudit, type AuditRecord } from '@shared/auditText';
import { normalizeName } from '@shared/duplicates';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { friendlyError } from '../../../lib/errors';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/useAuth';
import { useRoster } from '../roster/rosterData';

const PAGE = 50;

interface AuditRow extends AuditRecord {
  id: string;
  atMs: number;
}

/**
 * The audit log, readable (PROJECT_PLAN Sprint 10). Every payment, admin entry, late entry, removal,
 * result, winner, correction, claim, and merge is here with who did it, when, and why, so a dispute
 * is settled by reading rather than remembering (PERSONAS: Gerald). Admin only, and nothing here can
 * be changed: the log is written by functions (CLAUDE.md §4.5).
 */
export default function AuditPage() {
  const { user } = useAuth();
  const roster = useRoster();
  const [search, setSearch] = useState('');
  const log = useInfiniteQuery({
    queryKey: ['adminAuditLog'],
    initialPageParam: null as QueryDocumentSnapshot | null,
    queryFn: async ({ pageParam }) => {
      const base = query(collection(db, 'auditLog'), orderBy('at', 'desc'));
      const snap = await getDocs(
        pageParam ? query(base, startAfter(pageParam), limit(PAGE)) : query(base, limit(PAGE)),
      );
      return {
        rows: snap.docs.map((d): AuditRow => {
          const data = d.data() as AuditRecord & { at?: { toDate(): Date } };
          return { ...data, id: d.id, atMs: data.at?.toDate().getTime() ?? 0 };
        }),
        last: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : null,
      };
    },
    getNextPageParam: (page) => page.last,
  });

  const names = new Map((roster.data ?? []).map((p) => [p.playerId, p.displayName]));
  const rows = (log.data?.pages ?? []).flatMap((p) => p.rows);
  const described = rows.map((row) => ({
    row,
    text: describeAudit(row, (id) => names.get(id), user?.uid),
  }));
  const needle = normalizeName(search);
  const shown = needle
    ? described.filter(({ row, text }) =>
        normalizeName(`${text.what} ${text.where} ${text.who} ${row.reason ?? ''}`).includes(
          needle,
        ),
      )
    : described;

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <h1 className="font-heading text-h2">Audit log</h1>
      <p className="text-body text-ink-muted">
        Everything that changed money, picks, results, or who a player is, newest first. It can't be
        edited.
      </p>
      <Field
        label="Find"
        hint="A name, a week like “week 5”, or a word like “paid” or “late”."
        type="search"
        inputMode="search"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {log.isPending && <p role="status">Loading the log…</p>}
      {log.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          {friendlyError(log.error)}
        </p>
      )}
      {log.isSuccess && rows.length === 0 && <p className="text-body">Nothing in the log yet.</p>}
      {log.isSuccess && rows.length > 0 && shown.length === 0 && (
        <p className="text-body">
          Nothing matches in what's loaded. Load more, or try another word.
        </p>
      )}

      <ol className="flex flex-col gap-2" aria-label="Audit log">
        {shown.map(({ row, text }) => (
          <li key={row.id} className="rounded-md border-2 border-line-subtle bg-surface p-3">
            <p className="break-words font-heading text-h3">{text.what}</p>
            <p className="text-body text-ink-muted">
              {text.where && `${text.where} · `}
              {text.who} · {formatPoolDateTime(new Date(row.atMs), { weekday: 'short' })}
            </p>
            {row.reason && (
              <p className="break-words text-body">
                <strong>Reason:</strong> {row.reason}
              </p>
            )}
            <details>
              <summary className="min-h-touch cursor-pointer py-2 text-body text-ink-emphasis underline">
                Before and after
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted p-2 text-body-sm">
                {JSON.stringify({ before: row.before ?? null, after: row.after ?? null }, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>

      {log.hasNextPage && (
        <Button
          variant="ghost"
          disabled={log.isFetchingNextPage}
          onClick={() => log.fetchNextPage()}
        >
          {log.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
        </Button>
      )}
    </div>
  );
}
