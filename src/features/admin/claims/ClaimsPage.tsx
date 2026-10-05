import { useToast } from '../../../components/ui/toastContext';
import { friendlyError } from '../../../lib/errors';
import { useRoster } from '../roster/rosterData';
import { ClaimCard } from './ClaimCard';
import { useApproveClaim, useClaimsList, useRejectClaim, useUnlinkClaim } from './claimsData';

/**
 * The Claims tab (PROJECT_PLAN Sprint 5): players asking to link their login to the history the
 * pool already has for them. Every request waits here for a person to decide (D-004).
 */
export default function ClaimsPage() {
  const list = useClaimsList();
  const roster = useRoster();
  const approve = useApproveClaim();
  const reject = useRejectClaim();
  const unlink = useUnlinkClaim();
  const { showToast } = useToast();

  const linkable = (roster.data ?? [])
    .filter((p) => p.origin === 'admin' && !p.claimed)
    .map((p) => ({ playerId: p.playerId, displayName: p.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const busyClaim = approve.isPending
    ? approve.variables?.claimId
    : reject.isPending
      ? reject.variables?.claimId
      : null;

  function onApprove(claimId: string, claimedName: string, playerId: string, displayName: string) {
    approve.mutate(
      { claimId, playerId },
      {
        onSuccess: (result) =>
          showToast({
            message: result.merged
              ? `${claimedName} linked to ${displayName}, and ${result.movedWeeks.length} website ${result.movedWeeks.length === 1 ? 'week' : 'weeks'} joined`
              : `${claimedName} linked to ${displayName}`,
            // A plain link can be undone. A merge moved entries, so it has no one-tap undo.
            ...(result.merged
              ? {}
              : {
                  actionLabel: 'Undo',
                  onAction: () =>
                    unlink.mutate(
                      { playerId },
                      {
                        onSuccess: () => showToast({ message: `${displayName} unlinked` }),
                        onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
                      },
                    ),
                }),
          }),
        onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
      },
    );
  }

  function onReject(claimId: string, claimedName: string, note: string | null) {
    reject.mutate(
      { claimId, note },
      {
        onSuccess: () => showToast({ message: `Request from ${claimedName} rejected` }),
        onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
      },
    );
  }

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <h1 className="font-heading text-h2">Claims</h1>
      <p className="text-body text-ink-muted">
        Players asking to link their login to a roster player's history. They see nothing about the
        player until you approve.
      </p>

      {list.isPending && <p role="status">Loading requests…</p>}
      {list.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          {friendlyError(list.error)}
        </p>
      )}
      {list.isSuccess && list.data.claims.length === 0 && (
        <p className="text-body">No requests waiting. Nice work!</p>
      )}

      <ul className="flex flex-col gap-3" aria-label="Requests">
        {list.data?.claims.map((claim) => (
          <ClaimCard
            key={claim.claimId}
            claim={claim}
            others={linkable}
            busy={busyClaim === claim.claimId}
            onApprove={(playerId, displayName) =>
              onApprove(claim.claimId, claim.claimedName, playerId, displayName)
            }
            onReject={(note) => onReject(claim.claimId, claim.claimedName, note)}
          />
        ))}
      </ul>
    </div>
  );
}
