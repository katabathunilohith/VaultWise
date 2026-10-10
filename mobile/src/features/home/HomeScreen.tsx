import { useWindowDimensions } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { EmptyState, ErrorState, Screen, ScreenSkeleton, useNow } from "@/components/ui";
import { emoji3d } from "@/lib/categories";
import { useDashboard } from "@/lib/api/hooks";
import type { Dashboard } from "@/lib/api/types";
import { ComingUpCard } from "./ComingUpCard";
import { FreshStartCard } from "./FreshStartCard";
import { Hero } from "./Hero";
import { HomeHeader } from "./HomeHeader";
import { InsightCard } from "./InsightCard";
import { QuickActions } from "./QuickActions";
import { RecentActivity } from "./RecentActivity";
import { StreakCard } from "./StreakCard";
import { TodoCards } from "./TodoCards";
import { VaultCarousel } from "./VaultCarousel";

/** Everything Home shows; pull to refresh re-reads all of it. */
const HOME_QUERIES = new Set(["dashboard", "insight", "activity", "invest-core", "emergency"]);

/**
 * Home (expressive shell). Top to bottom, per the thumb-reach plan (heatmap §5.1): header,
 * a non-interactive viewing area, quick actions in the lower-middle band, then to-dos, what's
 * coming up, vaults, streak, a fresh-start idea, the week's insight and recent activity.
 */
export function HomeScreen() {
  const dash = useDashboard();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => HOME_QUERIES.has(String(q.queryKey[1])) });
  return (
    <Screen onRefresh={refresh}>
      <HomeHeader />
      {/* Keep showing the last good data if a refresh fails; the error screen is only for a cold start. */}
      {dash.data ? (
        <HomeBody data={dash.data} />
      ) : dash.isError ? (
        <ErrorState title="Home didn't load" error={dash.error} onRetry={() => void dash.refetch()} />
      ) : (
        <ScreenSkeleton />
      )}
    </Screen>
  );
}

function HomeBody({ data }: { data: Dashboard }) {
  const now = useNow(60_000);
  const { fontScale } = useWindowDimensions();
  const large = fontScale >= 1.3;
  return (
    <>
      <Hero saved={data.totals.saved} currency={data.currency} now={now} large={large} />
      <QuickActions large={large} />
      <TodoCards receiptsDue={data.emergency.receiptsDue} reviewPending={data.reviewPending} now={now} />
      <ComingUpCard dashboard={data} now={now} />
      {data.vaults.every((v) => v.status === "closed") ? (
        <EmptyState
          image={emoji3d.locked}
          title="Start your first vault"
          body="Pick a purpose, like health or a home. Money you add locks to it."
          action="New vault"
          onAction={() => router.push("/new-vault")}
        />
      ) : (
        <>
          <VaultCarousel vaults={data.vaults} currency={data.currency} />
          <StreakCard streak={data.streak} now={now} />
        </>
      )}
      <FreshStartCard vaults={data.vaults} currency={data.currency} now={now} large={large} />
      <InsightCard />
      <RecentActivity dashboard={data} now={now} />
    </>
  );
}
