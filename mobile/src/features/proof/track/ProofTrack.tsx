import { View } from "react-native";
import { router } from "expo-router";
import { ListChecksIcon } from "@/components/icons";
import { Card, Row, ScreenSkeleton, StatusPill, Timeline, Txt, VaultGlyph, useNow } from "@/components/ui";
import { useConnection } from "@/lib/api/hooks";
import { space, useTheme } from "@/theme";
import { CalmError } from "../components/CalmError";
import { TalkToPerson, TextLink } from "../components/Links";
import { amountText, describeProof } from "../describe";
import { useProofRecord, useProofRules } from "../hooks";
import { trackerSteps } from "../stages";

/** Compact tracker for one proof: where it is, the exact time, and the next step. */
export function ProofTrack({ id }: { id: string }) {
  const { cat } = useTheme();
  const record = useProofRecord(id);
  const rules = useProofRules();
  const { mode } = useConnection();
  const now = useNow(30_000, true);
  const proof = record.data;

  if (!proof) return record.error ? <CalmError error={record.error} onRetry={() => void record.refetch()} /> : <ScreenSkeleton />;

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
  const steps = trackerSteps(proof, { vaultName, outcome: d.outcome, withTimes: true, reviewBy: d.reviewBy, reviewLate: d.reviewLate, now });

  return (
    <>
      <Row gap={12}>
        <VaultGlyph category={category} size={40} />
        <View style={{ flex: 1 }}>
          <Txt v="labelL" numberOfLines={2}>
            {receipt ? "Emergency receipt" : `${amount !== null ? amountText(amount, currency) : "Withdrawal"}${proof.withdrawal?.payee ? ` to ${proof.withdrawal.payee}` : ""}`}
          </Txt>
          <Txt v="bodyM" color="textMuted" numberOfLines={1}>
            {proof.vault ? `From ${proof.vault.name}` : "Receipt check"}
          </Txt>
        </View>
        <StatusPill tone={d.pill.tone} label={d.pill.label} />
      </Row>
      <Card>
        <Timeline color={cat(category).tint} steps={steps} />
      </Card>
      <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
        <Txt v="titleM">{d.headline}</Txt>
        {d.lines.map((line) => (
          <Txt key={line} v="bodyM" color="textMuted">
            {line}
          </Txt>
        ))}
      </View>
      <View style={{ gap: space.xxs }}>
        <TextLink label="See every check" icon={ListChecksIcon} onPress={() => router.replace({ pathname: "/proof/[id]", params: { id } })} />
        <TalkToPerson replace />
      </View>
    </>
  );
}
