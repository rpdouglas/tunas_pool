import { Panel } from '../../components/ui/Panel';
import { BingoPage } from './BingoPage';
import { BingoPastGame } from '../../components/ui/BingoPastGame';
import { useBingoHistory, type BingoStatus } from './bingoData';

/** `/b/history`: past games, who won, the pot, and when (the Gerald Test: winners are named here). */
export default function BingoHistoryPage({ status }: { status: BingoStatus }) {
  const history = useBingoHistory(true);
  return (
    <BingoPage title="Past games" status={status}>
      {history.isError ? (
        <Panel>
          <p role="alert" className="text-body">
            Past games didn't load. Check your signal and refresh.
          </p>
        </Panel>
      ) : history.isPending ? (
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      ) : history.data.length === 0 ? (
        <Panel>
          <p className="text-body">No games finished yet.</p>
        </Panel>
      ) : (
        history.data.map((c) => <BingoPastGame key={c.id} c={c} />)
      )}
    </BingoPage>
  );
}
