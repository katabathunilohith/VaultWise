import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { LifebuoyIcon } from "@/components/icons";
import { Button, PracticeBadge, Row, Screen, ScreenSkeleton, Stack } from "@/components/ui";
import { useEmergency } from "@/lib/api/hooks";
import type { EmergencyOverview } from "@/lib/api/types";
import { space } from "@/theme";
import { CalmError } from "../CalmError";
import { owedReceipts } from "../copy";
import { go } from "../routes";
import { AvatarButton } from "./AvatarButton";
import { Hero, SafetyLimits } from "./Hero";
import { History } from "./History";
import { ReceiptsOwed } from "./ReceiptsOwed";
import { GuaranteeLine, TierCards } from "./TierCards";

/**
 * Emergency tab root (calm core). Placement follows the thumb-reach spec §5.7: what's ready and
 * the plain limits up top, the two tier cards in the middle, the primary inline in the lower
 * middle (never pinned above the tab bar), history below.
 */
export function EmergencyHome() {
  const q = useEmergency();
  return (
    <Screen onRefresh={() => q.refetch()}>
      <Row style={styles.header}>
        <AvatarButton />
        <PracticeBadge />
      </Row>
      {q.data ? (
        <Body o={q.data} refetch={q.refetch} />
      ) : q.isError ? (
        <CalmError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ScreenSkeleton />
      )}
    </Screen>
  );
}

function Body({ o, refetch }: { o: EmergencyOverview; refetch: () => Promise<unknown> }) {
  const owed = owedReceipts(o.history);
  useRefreshAtRelease(o, refetch);
  return (
    <>
      {owed.length ? <ReceiptsOwed items={owed} currency={o.currency} /> : null}
      <Stack gap={space.md}>
        <Hero o={o} />
        <SafetyLimits o={o} />
      </Stack>
      <TierCards o={o} />
      <Stack gap={space.sm}>
        <Button label="Get emergency money" icon={LifebuoyIcon} onPress={go.request} />
        <GuaranteeLine />
      </Stack>
      <History items={o.history} currency={o.currency} />
    </>
  );
}

/** While a Tier 2 request is in its safety pause, refresh once it's due so the list shows "Sent". */
function useRefreshAtRelease(o: EmergencyOverview, refetch: () => Promise<unknown>) {
  const pending = o.history.filter((h) => h.status === "processing" && h.releaseAt).map((h) => h.releaseAt);
  const next = pending.length ? Math.min(...pending) : null;
  useEffect(() => {
    if (next === null) return;
    // Already due: the server settles on its next read, so check again shortly.
    const delay = Math.max(next - Date.now() + 1500, 4000);
    const t = setTimeout(() => void refetch(), Math.min(delay, 10 * 60_000));
    return () => clearTimeout(t);
  }, [next, refetch, o]);
}

const styles = StyleSheet.create({
  header: { justifyContent: "space-between", paddingTop: space.xs },
});
