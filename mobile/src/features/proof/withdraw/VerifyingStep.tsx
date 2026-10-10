import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, ModalScreen, PracticeBadge, Row, Skeleton, Timeline, Txt, VaultGlyph, useNow } from "@/components/ui";
import type { ProofView } from "@/lib/api/types";
import { space, useTheme } from "@/theme";
import { amountText } from "../describe";
import { useProofPoll, useVerifyingHeartbeat } from "../hooks";
import { trackerSteps } from "../stages";
import { outcomeOf, type Outcome } from "../verdict";
import { ResultView } from "./ResultView";
import type { FlowVault } from "./types";

/** The heartbeat pattern lasts ~140 ms; the outcome waits until it has been quiet ≥150 ms. */
const HEARTBEAT_QUIET_MS = 300;
const SLOW_MS = 30_000;

/**
 * Verifying, then the result, in the same modal. Close and "Continue in background" both leave
 * the check running; nothing here cancels it.
 */
export function VerifyingStep({
  proofId,
  vault,
  amount,
  payee,
  onClose,
  onResult,
  onTryAnother,
}: {
  proofId: string;
  vault: FlowVault;
  amount: number;
  payee: string;
  onClose: () => void;
  onResult: () => void;
  onTryAnother: (reason: string) => void;
}) {
  const { cat } = useTheme();
  const q = useProofPoll(proofId);
  const proof = q.data;
  const outcome = outcomeOf(proof?.verification);
  const lastBeat = useVerifyingHeartbeat(!outcome);
  const [revealed, setRevealed] = useState<{ outcome: Outcome; proof: ProofView } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const now = useNow(1000, !outcome);

  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  // Reveal the outcome only once the heartbeat has stopped, so the two never overlap.
  useEffect(() => {
    if (!outcome || !proof || revealed) return;
    const wait = Math.max(0, lastBeat.current + HEARTBEAT_QUIET_MS - Date.now());
    const t = setTimeout(() => {
      // The result is pinned to the verification that produced it.
      setRevealed({ outcome, proof });
      onResultRef.current();
    }, wait);
    return () => clearTimeout(t);
  }, [outcome, proof, revealed, lastBeat]);

  if (revealed)
    return (
      <ResultView proof={revealed.proof} outcome={revealed.outcome} vault={vault} amount={amount} payee={payee} onClose={onClose} onTryAnother={onTryAnother} />
    );

  const slow = now - startedAt > SLOW_MS;
  return (
    <ModalScreen
      title={`Withdraw · ${vault.name}`}
      onClose={onClose}
      footer={<Button label="Continue in background" variant="tonal" onPress={onClose} accessibilityHint="Closes this screen. The check keeps going." />}
    >
      <PracticeBadge />
      <View style={{ gap: space.xs }} accessibilityLiveRegion="polite">
        <Txt v="headline" accessibilityRole="header">
          Checking your bill
        </Txt>
        <Txt v="bodyL" color="textMuted">
          Usually done in a few seconds.
        </Txt>
      </View>
      <Card>
        <Row gap={12}>
          <VaultGlyph category={vault.category} size={40} />
          <View style={{ flex: 1 }}>
            <Txt v="labelL">
              {amountText(amount, vault.currency)} to {payee}
            </Txt>
            <Txt v="bodyM" color="textMuted">
              From {vault.name}
            </Txt>
          </View>
        </Row>
      </Card>
      <Card>
        {proof ? (
          <Timeline color={cat(vault.category).tint} steps={trackerSteps(proof, { vaultName: vault.name, outcome: null })} />
        ) : (
          <View style={{ gap: space.md }} accessibilityLabel="Loading">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={24} width={`${80 - i * 10}%`} />
            ))}
          </View>
        )}
      </Card>
      {q.isError && !proof ? (
        <Banner tone="warning" title="Can't reach Vaultwise right now" body="Your bill was sent. We'll keep trying, and you can close this." />
      ) : slow ? (
        <Banner tone="info" title="This is taking longer than usual" body={`You can close this. The result will show in ${vault.name}.`} />
      ) : (
        <Txt v="bodyM" color="textMuted">
          You can close this. We’ll keep checking, and the result will show in {vault.name}.
        </Txt>
      )}
    </ModalScreen>
  );
}
