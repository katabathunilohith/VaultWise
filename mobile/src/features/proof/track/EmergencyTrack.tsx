import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ListChecksIcon, ReceiptIcon } from "@/components/icons";
import { Button, Card, EmptyState, Row, ScreenSkeleton, StatusPill, Timeline, Txt, VaultGlyph, useNow, type TimelineStep, type Tone } from "@/components/ui";
import { useEmergency } from "@/lib/api/hooks";
import type { EmergencyHistoryItem } from "@/lib/api/types";
import { space, useTheme } from "@/theme";
import { CalmError } from "../components/CalmError";
import { TalkToPerson, TextLink } from "../components/Links";
import { amountText } from "../describe";
import { clockTime, countdown, listJoin, whenText } from "../format";

type ReceiptState = "checked" | "checking" | "rejected" | "notNeeded" | "due" | "overdue";

function receiptState(item: EmergencyHistoryItem, now: number): ReceiptState {
  const s = (item.receiptStatus ?? "").toLowerCase();
  if (/verified|approved|accepted/.test(s)) return "checked";
  if (/denied|rejected|declined/.test(s)) return "rejected";
  if (/waived|not_required|none_required|not required/.test(s)) return "notNeeded";
  if (/processing|review|submitted|checking/.test(s) || (item.receiptProofId && !/due|pending|required|overdue/.test(s))) return "checking";
  if (item.receiptDueAt && now > item.receiptDueAt) return "overdue";
  return "due";
}

/** Plain tracker for an emergency payout: Requested → Released (or safety pause) → Receipt. */
export function EmergencyTrack({ id }: { id: string }) {
  const q = useEmergency();
  const item = q.data?.history.find((h) => h.id === id);
  const pending = !!item && !item.releasedAt && item.status !== "released" && item.status !== "blocked";
  const now = useNow(1000, pending);
  const paused = pending && !!item && item.releaseAt > now;
  const { cat } = useTheme();
  // When the safety pause ends, fetch the released state instead of waiting for a reopen.
  const wasPaused = useRef(paused);
  useEffect(() => {
    if (wasPaused.current && !paused) void q.refetch();
    wasPaused.current = paused;
  }, [paused, q]);

  if (q.isPending) return <ScreenSkeleton />;
  if (q.isError) return <CalmError error={q.error} onRetry={() => void q.refetch()} />;
  if (!item)
    return (
      <>
        <EmptyState title="We can't find this request" body="It may take a moment to show up. Close this and try again in a minute, or talk to a person." />
        <TalkToPerson replace />
      </>
    );

  const currency = q.data.currency;
  const amt = amountText(item.amount, currency);
  const vaults = listJoin(item.plan.map((p) => p.vaultName));
  const released = !!item.releasedAt || item.status === "released";
  const blocked = item.status === "blocked";
  const receipt = receiptState(item, now);
  const due = item.receiptDueAt;

  const release: TimelineStep = blocked
    ? { key: "release", title: "Not released", state: "failed", detail: "This request was over a safety limit, so no money moved." }
    : released
      ? {
          key: "release",
          title: "Released",
          state: "done",
          time: whenText(item.releasedAt ?? item.releaseAt, now),
          detail: vaults ? `Paid to your bank from ${vaults}.` : "Paid to your bank.",
        }
      : item.releaseAt > now
        ? {
            key: "release",
            title: "Safety pause",
            state: "active",
            time: countdown(item.releaseAt - now),
            detail: `The money releases at ${clockTime(item.releaseAt, true)}.`,
          }
        : { key: "release", title: "Releasing now", state: "active", detail: "The safety pause has ended. The money is on its way." };

  const receiptStep: TimelineStep = {
    checked: { key: "receipt", title: "Receipt checked", state: "done" as const, detail: "Nothing else to do." },
    checking: { key: "receipt", title: "Checking your receipt", state: "active" as const, detail: "Usually done in a few seconds." },
    rejected: {
      key: "receipt",
      title: "Receipt not accepted",
      state: "failed" as const,
      detail: due ? `Add a different one by ${whenText(due, now)}.` : "Add a different one, or talk to a person.",
    },
    notNeeded: { key: "receipt", title: "No receipt needed", state: "skipped" as const },
    due: { key: "receipt", title: "Receipt due", state: "pending" as const, detail: due ? `Add it by ${whenText(due, now)}.` : "Add it when you can." },
    overdue: {
      key: "receipt",
      title: "Receipt overdue",
      state: "warn" as const,
      detail: due ? `It was due by ${whenText(due, now)}. Add it now, or talk to a person.` : "Add it now, or talk to a person.",
    },
  }[receipt];

  const steps: TimelineStep[] = [
    { key: "requested", title: "Requested", state: "done", time: whenText(item.createdAt, now), detail: `${amt} · ${item.reason}` },
    release,
    ...(blocked ? [] : [receiptStep]),
  ];

  const pill: { tone: Tone; label: string } = blocked
    ? { tone: "danger", label: "Not released" }
    : !released
      ? { tone: "info", label: "Safety pause" }
      : receipt === "overdue"
        ? { tone: "warning", label: "Receipt overdue" }
        : receipt === "due" || receipt === "rejected"
          ? { tone: "warning", label: "Receipt due" }
          : { tone: "success", label: "Released" };
  const needsReceipt = !blocked && (receipt === "due" || receipt === "overdue" || receipt === "rejected");

  return (
    <>
      <Row gap={12}>
        <VaultGlyph category="emergency" size={40} />
        <View style={{ flex: 1 }}>
          <Txt v="labelL">{amt} emergency payout</Txt>
          <Txt v="bodyM" color="textMuted" numberOfLines={1}>
            Tier {item.tier} · {item.reason}
          </Txt>
        </View>
        <StatusPill tone={pill.tone} label={pill.label} />
      </Row>
      <Card>
        <Timeline color={cat("emergency").tint} steps={steps} />
      </Card>
      {needsReceipt ? (
        <Button
          label="Add the receipt"
          icon={ReceiptIcon}
          size="md"
          onPress={() => router.replace({ pathname: "/emergency-request", params: { receipt: item.id } })}
        />
      ) : null}
      <View style={{ gap: space.xxs }}>
        {item.receiptProofId ? (
          <TextLink label="See the receipt check" icon={ListChecksIcon} onPress={() => router.setParams({ kind: "proof", id: item.receiptProofId! })} />
        ) : null}
        <TalkToPerson replace />
      </View>
    </>
  );
}
