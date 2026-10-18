/**
 * Data for the spreadsheet import (D-096). Reads are direct (the rules let an admin read any
 * entry's picks). Every save goes through the same audited callables as a paper sheet:
 * `adminUpsertEntry` while the week is open, `adminLateOverride` after the lock. A new player is
 * added to the roster the same way the roster's Add form does it.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import type { EntryRow } from '@shared/adminTypes';
import type { SheetRow } from '@shared/picksImport';
import type { EntryPicks } from '@shared/types';
import { adminApi } from '../../../lib/adminApi';
import { friendlyError } from '../../../lib/errors';
import { db } from '../../../lib/firebase';
import { entriesKey } from '../payments/paymentsData';
import { createRosterPlayer, rosterKey } from '../roster/rosterData';
import type { ExistingEntry } from './importPlan';

/** This week's entries for the given players, with their picks, so the screen can compare. */
export function useExistingEntries(
  year: string,
  weekId: string,
  entries: EntryRow[] | undefined,
  playerIds: string[],
) {
  const wanted = (entries ?? []).filter((e) => playerIds.includes(e.playerId));
  return useQuery({
    queryKey: [
      'importExisting',
      year,
      weekId,
      wanted
        .map((e) => e.playerId)
        .sort()
        .join(','),
    ],
    enabled: entries !== undefined,
    queryFn: async (): Promise<Map<string, ExistingEntry>> => {
      const pairs = await Promise.all(
        wanted.map(async (e) => {
          const snap = await getDoc(
            doc(db, `seasons/${year}/weeks/${weekId}/entries/${e.playerId}/private/picks`),
          );
          const picks = snap.exists() ? (snap.data() as EntryPicks) : null;
          const existing: ExistingEntry = {
            source: e.source,
            picks: picks?.picks ?? null,
            tiebreakerTotal: picks?.tiebreakerTotal ?? null,
          };
          return [e.playerId, existing] as const;
        }),
      );
      return new Map(pairs);
    },
  });
}

export interface ImportJob {
  row: SheetRow;
  /** Null to add the row's name to the roster first. */
  playerId: string | null;
}

export interface ImportOutcome {
  line: number;
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Saves the rows one at a time, so each gets its own audit entry and a failure stops only that row.
 * `reason` is set after the lock: every row then goes in as a late entry with that reason.
 */
export function useRunImport(year: string, weekId: string) {
  const client = useQueryClient();
  return async (
    jobs: ImportJob[],
    reason: string | null,
    onProgress: (done: number) => void,
  ): Promise<ImportOutcome[]> => {
    const outcomes: ImportOutcome[] = [];
    let addedPlayer = false;
    for (const [i, { row, playerId }] of jobs.entries()) {
      try {
        let id = playerId;
        if (!id) {
          id = await createRosterPlayer({
            displayName: row.name,
            phone: null,
            usualPayment: null,
            notes: null,
          });
          addedPlayer = true;
        }
        const entry = {
          source: 'paper' as const,
          picks: row.picks,
          tiebreakerTotal: row.tiebreakerTotal ?? 0,
          paperPhotoPath: null,
          markPaid: null,
        };
        await (reason === null
          ? adminApi.upsertEntry({ year, weekId, playerId: id, entry })
          : adminApi.lateOverride({ year, weekId, playerId: id, entry, reason }));
        outcomes.push({
          line: row.line,
          name: row.name,
          ok: true,
          message: playerId ? 'Saved' : 'Added to the roster and saved',
        });
      } catch (err) {
        outcomes.push({ line: row.line, name: row.name, ok: false, message: friendlyError(err) });
      }
      onProgress(i + 1);
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: entriesKey(year, weekId) }),
      client.invalidateQueries({ queryKey: ['importExisting', year, weekId] }),
      ...(addedPlayer ? [client.invalidateQueries({ queryKey: rosterKey })] : []),
    ]);
    return outcomes;
  };
}
