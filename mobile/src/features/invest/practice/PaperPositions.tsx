import { StyleSheet, View } from "react-native";
import { ArrowUpRightIcon, type Icon } from "@/components/icons";
import { Divider, Txt } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";
import { fmtDay, fmtPrice } from "../format";
import type { PaperPosition } from "./parse";

const ArrowDownRightIcon: Icon = require("phosphor-react-native/src/icons/ArrowDownRight").ArrowDownRightIcon;

/**
 * Open paper positions as a quiet list: what, which way, and the three prices. Direction is
 * an arrow plus words, in the muted text colour — no red/green, no live ticking, no actions.
 */
export function PaperPositions({ positions, names, closedCount }: { positions: PaperPosition[]; names: Record<string, string>; closedCount: number }) {
  return (
    <View style={{ gap: space.xs }}>
      {positions.length ? (
        <>
          {positions.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <PositionRow p={p} name={names[p.symbol]} />
            </View>
          ))}
          <Txt v="caption" color="textMuted">
            Prices are in each market&apos;s own currency. The stop is where a trade closes to limit a loss; the target is where it takes a gain.
          </Txt>
        </>
      ) : (
        <Txt v="bodyM" color="textMuted">
          No open practice trades right now. The strategy opens one only when its setup appears.
        </Txt>
      )}
      {closedCount > 0 ? (
        <Txt v="caption" color="textMuted">
          {`${closedCount} earlier practice ${closedCount === 1 ? "trade has" : "trades have"} closed.`}
        </Txt>
      ) : null}
    </View>
  );
}

function PositionRow({ p, name }: { p: PaperPosition; name?: string }) {
  const { c } = useTheme();
  const rise = p.direction === "rise";
  const DirIcon = rise ? ArrowUpRightIcon : ArrowDownRightIcon;
  const dirWords = rise ? "Expects the price to rise" : "Expects the price to fall";
  const opened = p.openedAt ? `Opened ${fmtDay(p.openedAt)}` : null;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${p.symbol}${name ? `, ${name}` : ""}. ${dirWords}. Entry ${fmtPrice(p.entry)}, stop ${fmtPrice(p.stop)}, target ${fmtPrice(p.target)}.${opened ? ` ${opened}.` : ""}`}
    >
      <View style={styles.head}>
        <Txt v="labelL" style={{ flexShrink: 1 }}>
          {p.symbol}
          {name ? (
            <Txt v="bodyM" color="textMuted">
              {`  ${name}`}
            </Txt>
          ) : null}
        </Txt>
        {opened ? (
          <Txt v="caption" color="textMuted">
            {opened}
          </Txt>
        ) : null}
      </View>
      <View style={styles.dir}>
        <DirIcon size={16} color={c.textMuted} weight="bold" />
        <Txt v="bodyM" color="textMuted">
          {dirWords}
        </Txt>
      </View>
      <View style={styles.prices}>
        <Price label="Entry" value={p.entry} />
        <Price label="Stop" value={p.stop} />
        <Price label="Target" value={p.target} />
      </View>
    </View>
  );
}

function Price({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.price}>
      <Txt v="micro" color="textMuted">
        {label.toUpperCase()}
      </Txt>
      <Txt v="numM">{fmtPrice(value)}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, minHeight: layout.rowMin, paddingVertical: space.sm },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: space.xs },
  dir: { flexDirection: "row", alignItems: "center", gap: 6 },
  prices: { flexDirection: "row", gap: space.sm },
  price: { flex: 1, gap: 2 },
});
