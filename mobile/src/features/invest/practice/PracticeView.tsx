import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretDownIcon, InfoIcon, type Icon } from "@/components/icons";
import { Amount, Banner, Button, Divider, MoneyText, Press, ScreenSkeleton, Stack, Txt } from "@/components/ui";
import { useInvestSatellite, usePortfolio } from "@/lib/api/hooks";
import type { Portfolio } from "@/lib/api/types";
import { layout, space, useTheme } from "@/theme";
import { CalmError } from "../CalmError";
import { Pnl } from "../Pnl";
import { AllocateModal } from "./AllocateModal"; // mpin
import { Blueprint, PracticeChip } from "./Blueprint";
import { PaperPositions } from "./PaperPositions";
import { parseSatellite, type SatelliteView } from "./parse";
import { StrategyStages, statusSentence } from "./StrategyStatus";

const CaretUpIcon: Icon = require("phosphor-react-native/src/icons/CaretUp").CaretUpIcon;

/**
 * Practice (the Satellite sleeve): a strategy paper-trading with virtual money. Deliberately
 * quiet — blueprint surface, muted palette, no trade buttons, no price-move colours, no haptics,
 * no streaks, points or rankings (FCA/SEC digital engagement practices). The one action is setting
 * money aside (turning it on, or more within the cap), a money move with the MPIN (AllocateModal).
 */
export function PracticeView() {
  const pf = usePortfolio();
  const sat = useInvestSatellite();
  const [allocating, setAllocating] = useState(false);
  // A fresh key per open remounts the flow, so every visit starts at its first step.
  const [opens, setOpens] = useState(0);
  if (!pf.data || !sat.data) {
    const error = pf.error ?? sat.error;
    if (error)
      return (
        <CalmError
          error={error}
          onRetry={() => {
            if (pf.error) void pf.refetch();
            if (sat.error) void sat.refetch();
          }}
        />
      );
    return <ScreenSkeleton />;
  }
  const view = parseSatellite(sat.data);
  const optedIn = pf.data.satellite.optedIn || view.optedIn;
  const e = view.eligibility;
  // Only when the server says it can take more: eligible, with room left under the cap (or no figure to go on).
  const canAllocate = !!e?.eligible && view.disclosures.length > 0 && (e.headroom === null || e.headroom > 0);
  const allocate = () => {
    setOpens((n) => n + 1);
    setAllocating(true);
  };
  return (
    <Stack gap={space.lg}>
      <Blueprint>
        <PracticeChip />
        {optedIn ? (
          <PracticeBody satellite={pf.data.satellite} currency={pf.data.currency} view={view} onAllocate={canAllocate ? allocate : undefined} />
        ) : (
          <PracticeOff view={view} onTurnOn={canAllocate ? allocate : undefined} />
        )}
      </Blueprint>
      <Txt v="caption" color="textMuted" align="center">
        Virtual money only. Not investment advice.
      </Txt>
      <AllocateModal
        key={`allocate-${opens}`}
        visible={allocating}
        onClose={() => setAllocating(false)}
        onAskPerson={() => router.push("/support")}
        currency={pf.data.currency}
        optedIn={optedIn}
        capPct={e?.capPct ?? view.maxAllocationPct}
        headroom={e?.headroom ?? null}
        disclosures={view.disclosures}
      />
    </Stack>
  );
}

function PracticeOff({ view, onTurnOn }: { view: SatelliteView; onTurnOn?: () => void }) {
  const cap = view.maxAllocationPct;
  const blocker = view.eligibility?.checks.find((c) => !c.pass);
  return (
    <Stack gap={space.xs}>
      <Txt v="titleL" accessibilityRole="header">
        Practice is off
      </Txt>
      <Txt v="bodyM" color="textMuted">
        {`Practice runs a trading strategy with virtual money so you can watch how it behaves. It's opt-in${
          cap ? `, capped at ${cap}% of your investments,` : ""
        } and kept apart from your vaults.`}
      </Txt>
      {onTurnOn ? (
        <Button label="Turn on Practice" variant="tonal" size="md" onPress={onTurnOn} style={{ alignSelf: "flex-start" }} />
      ) : blocker ? (
        <Txt v="bodyM" color="textMuted">
          {`Not available yet: ${blocker.label.toLowerCase()}. ${blocker.detail}`}
        </Txt>
      ) : (
        <Txt v="bodyM" color="textMuted">
          You can turn it on in Vaultwise on the web.
        </Txt>
      )}
    </Stack>
  );
}

function PracticeBody({
  satellite,
  currency,
  view,
  onAllocate,
}: {
  satellite: Portfolio["satellite"];
  currency: string;
  view: SatelliteView;
  onAllocate?: () => void;
}) {
  const status = statusSentence(view.stages);
  return (
    <>
      <Stack gap={space.xxs}>
        <Txt v="labelM" color="textMuted">
          Practice balance
        </Txt>
        <Amount value={satellite.equity} currency={currency} size="m" animate={false} />
      </Stack>
      <View style={styles.figures}>
        <Figure label="Set aside for practice">
          <MoneyText value={satellite.allocated} currency={currency} />
        </Figure>
        <Figure label="From closed trades">
          <Pnl value={satellite.realized} currency={currency} muted />
        </Figure>
      </View>
      {onAllocate ? <Button label="Set aside more" variant="ghost" size="sm" onPress={onAllocate} style={{ alignSelf: "flex-start" }} /> : null}

      <Divider />
      <Stack gap={space.xs}>
        <Txt v="titleM" accessibilityRole="header">
          {status.title}
        </Txt>
        <Txt v="bodyM" color="textMuted">
          {status.body}
        </Txt>
        {view.stages.length ? <StrategyStages stages={view.stages} /> : null}
      </Stack>

      <Divider />
      <Stack gap={space.xs}>
        <Txt v="titleM" accessibilityRole="header">
          Open practice trades
        </Txt>
        <PaperPositions positions={view.openPositions} names={view.marketNames} closedCount={view.closedCount} />
      </Stack>

      <Banner
        tone="neutral"
        icon={InfoIcon}
        title="No proven edge"
        body="It follows Smart Money Concepts, chart rules traders share online. There's no peer-reviewed evidence they give an edge after costs."
      />
      <HowItWorks items={howItWorks(view.maxAllocationPct)} />
    </>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.figure}>
      <Txt v="caption" color="textMuted">
        {label}
      </Txt>
      {children}
    </View>
  );
}

/**
 * Written here rather than taken from the server, whose disclosures use trading terms
 * ("walk-forward validation", "live capital") people shouldn't have to learn.
 */
function howItWorks(capPct: number | null) {
  return [
    `It's opt-in${capPct ? ` and can use at most ${capPct}% of your investments` : ""}. It's kept apart from your vaults, and vault money is never used for trading.`,
    "Before it could ever use real money, it has to pass a test on past prices and then a practice period. Until then, what's set aside stays as cash.",
    "Crypto and currency prices swing a lot. With real money, you could lose some or all of what you set aside.",
  ];
}

/** Inline expandable explanation (R7: explanations are inline cards, not another sheet). */
function HowItWorks({ items }: { items: string[] }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const Caret = open ? CaretUpIcon : CaretDownIcon;
  return (
    <View style={[styles.how, { borderColor: c.border, backgroundColor: c.bg }]}>
      <Press
        accessibilityLabel="How Practice works"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        scaleTo={0.99}
        style={styles.howHead}
      >
        <Txt v="labelL" style={{ flex: 1 }}>
          How Practice works
        </Txt>
        <Caret size={18} color={c.textMuted} />
      </Press>
      {open ? (
        <Stack gap={space.xs} style={{ paddingBottom: space.sm }}>
          {items.map((d) => (
            <View key={d} style={styles.bullet}>
              <Txt v="bodyM" color="textMuted">
                •
              </Txt>
              <Txt v="bodyM" color="textMuted" style={{ flex: 1 }}>
                {d}
              </Txt>
            </View>
          ))}
        </Stack>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  figure: { flexGrow: 1, flexBasis: 140, gap: 2 },
  how: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  howHead: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: layout.rowMin },
  bullet: { flexDirection: "row", gap: space.xs },
});
