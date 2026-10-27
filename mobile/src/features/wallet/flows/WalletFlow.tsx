import { router } from "expo-router";
import { Banner, Button, ErrorState, ModalScreen, PracticeBadge } from "@/components/ui";
import { useWallet, walletMissing } from "../hooks";
import { isWalletAction, walletActionHref, walletRestricted, type WalletAction } from "../model";
import { WalletOnHold } from "../OnHold";
import { AddFlow } from "./AddFlow";
import { CashOutFlow } from "./CashOutFlow";
import { LimitFlow } from "./LimitFlow";
import { MoveFlow } from "./MoveFlow";
import { closeFlow, FlowSkeleton } from "./parts";
import { SpendFlow } from "./SpendFlow";

const TITLE: Record<WalletAction, string> = {
  add: "Add money",
  move: "Move to a vault",
  spend: "Pay someone",
  "cash-out": "Cash out",
  limit: "Daily limit",
};

/**
 * One wallet flow (full-screen modal, calm core), picked by the route's action. Waits for the
 * wallet first: every flow checks amounts against it before anything is sent.
 */
export function WalletFlow({ action, vaultId }: { action: string | undefined; vaultId?: string }) {
  const q = useWallet();
  if (!isWalletAction(action))
    return (
      <ModalScreen title="Wallet" onClose={closeFlow}>
        <ErrorState variant="calm" title="This isn't something the wallet does" error={new Error("Close this and choose an action on the Wallet screen.")} />
      </ModalScreen>
    );
  const title = TITLE[action];

  if (!q.data)
    return (
      <ModalScreen title={title} onClose={closeFlow}>
        {q.isError && walletRestricted(q.error) ? (
          <WalletOnHold />
        ) : q.isError ? (
          <ErrorState
            variant="calm"
            title={walletMissing(q.error) ? "The wallet isn't available" : "Your wallet didn't load"}
            error={walletMissing(q.error) ? new Error("This Vaultwise server doesn't have a wallet yet.") : q.error}
            onRetry={walletMissing(q.error) ? undefined : () => void q.refetch()}
          />
        ) : (
          <FlowSkeleton />
        )}
      </ModalScreen>
    );

  const wallet = q.data;
  // Switched off on the server: only cashing out still works, so money is never stuck.
  if (!wallet.enabled && action !== "cash-out")
    return (
      <ModalScreen
        title={title}
        onClose={closeFlow}
        footer={
          wallet.balance > 0 ? <Button label="Cash out" onPress={() => router.replace(walletActionHref("cash-out"))} armOnMount /> : undefined
        }
      >
        <PracticeBadge />
        <Banner
          tone="info"
          title="The wallet is off for now"
          body={wallet.balance > 0 ? "You can still move the money in it to your bank." : "Nothing in your wallet needs moving."}
        />
      </ModalScreen>
    );

  switch (action) {
    case "add":
      return <AddFlow wallet={wallet} />;
    case "move":
      return <MoveFlow wallet={wallet} vaultId={vaultId} />;
    case "spend":
      return <SpendFlow wallet={wallet} />;
    case "cash-out":
      return <CashOutFlow wallet={wallet} />;
    case "limit":
      return <LimitFlow wallet={wallet} />;
  }
}
