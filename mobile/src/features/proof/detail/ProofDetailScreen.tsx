import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretDownIcon, LifebuoyIcon } from "@/components/icons";
import { Amount, Button, Card, PracticeBadge, Press, Row, Screen, ScreenSkeleton, StatusPill, Timeline, Txt, VaultGlyph, useNow } from "@/components/ui";
import { useConnection } from "@/lib/api/hooks";
import type { ProofView } from "@/lib/api/types";
import { layout, space, useTheme } from "@/theme";
import { AppealBox } from "../components/AppealBox";
import { CalmError } from "../components/CalmError";
import { DocumentCard } from "../components/DocumentCard";
import { BackHeader, TalkToPerson } from "../components/Links";
import { describeProof } from "../describe";
import { whenText } from "../format";
import { useProofRecord, useProofRules } from "../hooks";
import { CaretUpIcon } from "../icons";
import { stageSteps } from "../stages";

/**
 * The full release tracker for one proof (pushed): what it's for, every stage in plain words
 * with its checks, what we read from the document, the verdict, and a person within reach.
 */
export function ProofDetailScreen({ id }: { id: string }) {
  const record = useProofRecord(id);
  const proof = record.data;
  return (
    <Screen onRefresh={() => record.refetch()}>
      <BackHeader label="Release tracker" />
      {proof ? (
        <ProofDetail proof={proof} fromPracticeHistory={record.fromPracticeHistory} />
      ) : record.error ? (
        <CalmError title="This record didn't load" error={record.error} onRetry={() => void record.refetch()} />
      ) : (
        <ScreenSkeleton />
      )}
    </Screen>
  );
}

function ProofDetail({ proof, fromPracticeHistory }: { proof: ProofView; fromPracticeHistory: boolean }) {
  const { cat } = useTheme();
  const rules = useProofRules();
  const { mode } = useConnection();
  const now = useNow(30_000, true);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const receipt = proof.purpose === "emergency_receipt";
  const category = proof.vault?.category ?? (receipt ? "emergency" : proof.category);
  const vaultName = proof.vault?.name ?? (receipt ? "your emergency payout" : "this vault");
  const currency = rules.currency ?? proof.extracted?.currency ?? "INR";
  const amount = proof.withdrawal?.amount ?? null;
  const d = describeProof(proof, {
    vaultName,
    category: proof.category || category,
    currency,
    amount,
    maxDocAgeDays: rules.maxDocAgeDays,
    reviewSlaHours: rules.reviewSlaHours,
    now,
    demo: mode === "demo",
  });
  const steps = stageSteps(proof, { vaultName, maxDocAgeDays: rules.maxDocAgeDays, outcome: d.outcome, expanded, now });
  // Same rule as the server: only a decline can go to a person, and only once. A check already with
  // a person answers 409, so it offers Talk to a person instead of a note box.
  const canAppeal = d.outcome === "declined" && proof.verification.finalDecision === "denied" && !proof.verification.appealNote;
  const canRetry = d.outcome === "declined" && !!proof.vault && proof.withdrawal?.status === "denied";

  return (
    <>
      <PracticeBadge />

      <View style={{ gap: space.xs }}>
        <Row gap={10}>
          <VaultGlyph category={category} size={36} />
          <Txt v="labelM" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
            {receipt ? "Emergency receipt" : (proof.vault?.name ?? "Withdrawal")}
          </Txt>
          <StatusPill tone={d.pill.tone} label={d.pill.label} />
        </Row>
        {amount !== null ? <Amount value={amount} currency={currency} size="l" animate={false} /> : null}
        <Txt v="bodyM" color="textMuted">
          {proof.withdrawal?.payee ? `To ${proof.withdrawal.payee} · ` : ""}Sent {whenText(proof.createdAt, now)}
        </Txt>
      </View>

      <Card>
        <Txt v="titleL" accessibilityRole="header">
          {d.headline}
        </Txt>
        {d.lines.map((line, i) => (
          <Txt key={line} v={i === 0 ? "bodyL" : "bodyM"} color={i === 0 ? "text" : "textMuted"}>
            {line}
          </Txt>
        ))}
        {canRetry ? (
          <Button
            label="Try another document"
            size="md"
            onPress={() => router.push({ pathname: "/withdraw/[vaultId]", params: { vaultId: proof.vault!.id, withdrawalId: proof.withdrawal!.id } })}
          />
        ) : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt v="titleM">{d.outcome ? "Every check" : "Checking now"}</Txt>
          {proof.verification.decidedAt ? (
            <Txt v="numS" color="textMuted">
              {whenText(proof.verification.decidedAt, now)}
            </Txt>
          ) : null}
        </Row>
        <Timeline color={cat(category).tint} steps={steps} />
        <Press
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Hide what we checked" : "Show what we checked"}
          accessibilityState={{ expanded }}
          style={styles.toggle}
        >
          <Txt v="labelM" color="accent">
            {expanded ? "Hide what we checked" : "Show what we checked"}
          </Txt>
          {expanded ? <CaretUpIcon size={16} color={cat(category).tint} /> : <CaretDownIcon size={16} color={cat(category).tint} />}
        </Press>
      </Card>

      <DocumentCard proof={proof} currency={currency} title={receipt ? "Your receipt" : "Your bill"} fallbackIssuer={proof.withdrawal?.payee} />

      {proof.verification.appealNote ? (
        <Card>
          <Txt v="titleM">Your note to the reviewer</Txt>
          <Txt v="bodyM">{proof.verification.appealNote}</Txt>
        </Card>
      ) : null}
      {proof.verification.reviewerNote ? (
        <Card>
          <Txt v="titleM">From the reviewer</Txt>
          <Txt v="bodyM">{proof.verification.reviewerNote}</Txt>
        </Card>
      ) : null}

      {/* Once sent, the box stays to confirm it, though the refreshed proof is no longer appealable. */}
      {noteOpen ? (
        <AppealBox
          proofId={proof.id}
          autoFocus
          title="Ask a person to check"
          body="Tell them anything that helps. They'll look at the bill again."
          sentTitle="Sent to a person"
          sentBody={`A person on our team will look again. You'll hear back by ${whenText(now + rules.reviewSlaHours * 3_600_000)}.`}
        />
      ) : canAppeal ? (
        <Button label="Ask a person to check" variant="tonal" size="md" onPress={() => setNoteOpen(true)} />
      ) : null}

      {receipt && proof.emergencyId ? (
        <Button
          label="Emergency request"
          icon={LifebuoyIcon}
          variant="ghost"
          size="sm"
          onPress={() => router.push({ pathname: "/track", params: { kind: "emergency", id: proof.emergencyId! } })}
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}

      <TalkToPerson />

      {fromPracticeHistory ? (
        <Txt v="caption" color="textMuted">
          From your Practice history. In Practice mode, money and checks are simulated.
        </Txt>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: layout.hit, alignSelf: "flex-start" },
});
