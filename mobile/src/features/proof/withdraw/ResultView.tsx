import { useLayoutEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { ListChecksIcon } from "@/components/icons";
import { Button, Card, ModalScreen, PracticeBadge, Timeline, Txt } from "@/components/ui";
import { useConnection } from "@/lib/api/hooks";
import type { ProofView } from "@/lib/api/types";
import { haptic, type TokenName } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { AppealBox } from "../components/AppealBox";
import { DocumentCard } from "../components/DocumentCard";
import { TalkToPerson, TextLink } from "../components/Links";
import { amountText, describeProof } from "../describe";
import { whenText } from "../format";
import { useProofRules } from "../hooks";
import { trackerSteps } from "../stages";
import type { Outcome } from "../verdict";
import type { FlowVault } from "./types";

const OUTCOME_HAPTIC: Record<Outcome, TokenName> = {
  approved: "proof.approved",
  review: "proof.review",
  declined: "proof.declined",
};

/**
 * The outcome, in the flow's R1/R2 slots. Paid → Done. With a person → Done, plus a note for the
 * reviewer. Declined → Try another document, plus Ask a person to check. No confetti: money out.
 */
export function ResultView({
  proof,
  outcome,
  vault,
  amount,
  payee,
  onClose,
  onTryAnother,
}: {
  proof: ProofView;
  outcome: Outcome;
  vault: FlowVault;
  amount: number;
  payee: string;
  onClose: () => void;
  onTryAnother: (reason: string) => void;
}) {
  const { cat } = useTheme();
  const rules = useProofRules();
  const { mode } = useConnection();
  const [now] = useState(() => Date.now());
  const [noteOpen, setNoteOpen] = useState(false);
  const [appealed, setAppealed] = useState(false);
  const d = describeProof(proof, {
    vaultName: vault.name,
    category: vault.proofCategory,
    currency: vault.currency,
    amount,
    maxDocAgeDays: rules.maxDocAgeDays,
    reviewSlaHours: rules.reviewSlaHours,
    now,
    demo: mode === "demo",
  });

  // The outcome haptic plays once, in the commit that first shows the result (the camera closed steps ago).
  const fired = useRef(false);
  useLayoutEffect(() => {
    if (fired.current) return;
    fired.current = true;
    haptic(OUTCOME_HAPTIC[outcome]);
  }, [outcome]);

  const amt = amountText(amount, vault.currency);
  const reviewBy = whenText(now + rules.reviewSlaHours * 3_600_000, now);
  const seeChecks = () => router.push({ pathname: "/proof/[id]", params: { id: proof.id } });

  let footer;
  if (outcome === "approved") footer = <Button label="Done" armOnMount onPress={onClose} />;
  else if (outcome === "review")
    footer = (
      <>
        {!noteOpen && !appealed && !proof.verification.appealNote ? <Button label="Add a note for the reviewer" variant="tonal" size="md" onPress={() => setNoteOpen(true)} /> : null}
        <Button label="Done" armOnMount onPress={onClose} />
      </>
    );
  else
    footer = appealed ? (
      <Button label="Done" onPress={onClose} />
    ) : (
      <>
        {!noteOpen ? <Button label="Ask a person to check" variant="tonal" size="md" onPress={() => setNoteOpen(true)} /> : null}
        <Button label="Try another document" armOnMount onPress={() => onTryAnother(d.decline?.reason ?? d.lines[0])} />
      </>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "web" ? undefined : "padding"}>
      <ModalScreen title={`Withdraw · ${vault.name}`} onClose={onClose} footer={footer}>
        <PracticeBadge />
        <View style={{ gap: space.xs }} accessibilityLiveRegion="polite">
          <Txt v="headline" accessibilityRole="header">
            {d.headline}
          </Txt>
          {d.lines.map((line, i) => (
            <Txt key={line} v={i === 0 ? "bodyL" : "bodyM"} color={i === 0 ? "text" : "textMuted"}>
              {line}
            </Txt>
          ))}
        </View>

        {outcome === "approved" ? (
          <>
            <DocumentCard
              proof={proof}
              currency={vault.currency}
              title="Receipt"
              fallbackIssuer={payee}
              extra={[
                { label: "Paid", value: amt, mono: "m" },
                { label: "To", value: payee },
                { label: "Covered by", value: vault.name },
              ]}
            />
            <Txt v="caption" color="textMuted">
              In Practice mode this payout is simulated. No real money moves.
            </Txt>
          </>
        ) : null}

        {outcome === "review" ? (
          <Card>
            <Timeline color={cat(vault.category).tint} steps={trackerSteps(proof, { vaultName: vault.name, outcome, reviewBy: d.reviewBy, reviewLate: d.reviewLate })} />
          </Card>
        ) : null}

        {noteOpen ? (
          <AppealBox
            proofId={proof.id}
            autoFocus
            title={outcome === "review" ? "Add a note for the reviewer" : "Ask a person to check"}
            body={outcome === "review" ? "Anything that helps them decide, like what the bill was for." : "Tell them anything that helps. They'll look at the bill again."}
            sentTitle={outcome === "review" ? "Note sent" : "Sent to a person"}
            sentBody={outcome === "review" ? "The reviewer will see it with your bill." : `A person on our team will look again. You'll hear back by ${reviewBy}.`}
            onSent={() => setAppealed(true)}
          />
        ) : null}

        {outcome !== "approved" ? (
          <View>
            <TextLink label="See every check" icon={ListChecksIcon} onPress={seeChecks} />
            <TalkToPerson />
          </View>
        ) : null}
      </ModalScreen>
    </KeyboardAvoidingView>
  );
}
