/** Audit log writes (CLAUDE.md §4.5). Clients can never write auditLog; only functions do. */
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { AuditAction } from '../../shared/types';

export interface AuditInput {
  /** The admin's uid, or "system:lockWeeks" for the scheduler. */
  actorUid: string;
  /** Set for the counter role only (D-095), so the log can say whose hands these were. */
  actorRole?: 'counter';
  actorEmail?: string | null;
  action: AuditAction;
  /** Document path the change was made to. */
  target: string;
  before: unknown;
  after: unknown;
  reason?: string;
  year?: string;
  weekId?: string;
}

/** Firestore rejects undefined values, so leave them out. */
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function auditInTransaction(tx: Transaction, db: Firestore, input: AuditInput): void {
  tx.create(db.collection('auditLog').doc(), {
    at: FieldValue.serverTimestamp(),
    ...withoutUndefined({ ...input }),
  });
}
