import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CaretDownIcon, FirstAidKitIcon, ShieldCheckIcon, VaultIcon, type Icon } from "@/components/icons";
import { Divider, Press, Row, Stack, Txt, VaultGlyph } from "@/components/ui";
import type { EmergencyOverview, VaultCategory } from "@/lib/api/types";
import { layout, radius, space, useTheme } from "@/theme";
import { fmt } from "../format";

type SlimVault = { id: string; name: string; category: VaultCategory; available: number };

/** The two routes to emergency money (≥96 pt each). Tap a card to see which vaults it draws from. */
export function TierCards({ o }: { o: EmergencyOverview }) {
  const { cat, c } = useTheme();
  const days = o.rules.receiptWindowDays;
  return (
    <Stack gap={space.sm}>
      <TierCard
        tier="Tier 1"
        icon={FirstAidKitIcon}
        tint={cat("health").tint}
        title="From Health, instantly"
        body={
          o.healthVaults.length
            ? `No paperwork today — add the receipt within ${days} days.`
            : "Set up a Health vault to get emergency money with no wait."
        }
        amount={o.tier1Available}
        currency={o.currency}
        vaults={o.healthVaults}
      />
      <TierCard
        tier="Tier 2"
        icon={VaultIcon}
        tint={c.text}
        title="From your other vaults"
        body={`After your PIN and a ${o.rules.tier2HoldSeconds}-second safety pause.`}
        amount={o.tier2Available}
        currency={o.currency}
        vaults={o.tier2Vaults}
      />
    </Stack>
  );
}

function TierCard({
  tier,
  icon: IconCmp,
  tint,
  title,
  body,
  amount,
  currency,
  vaults,
}: {
  tier: string;
  icon: Icon;
  tint: string;
  title: string;
  body: string;
  amount: number;
  currency: string;
  vaults: SlimVault[];
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const canOpen = vaults.length > 0;
  const label = `${tier}. ${title}. ${fmt(amount, currency)} available. ${body}`;
  const cardStyle = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];
  const content = (
    <>
      <Row gap={space.xs} style={styles.line}>
        <IconCmp size={22} color={tint} weight="duotone" />
        <Txt v="labelL" style={styles.flex}>
          {title}
        </Txt>
        <Txt v="numM">{fmt(amount, currency)}</Txt>
      </Row>
      <Row gap={space.xs} style={styles.line}>
        <Txt v="bodyM" color="textMuted" style={styles.flex}>
          {body}
        </Txt>
        {canOpen ? (
          <Row gap={2} style={styles.count}>
            <Txt v="caption" color="textMuted">
              {vaults.length === 1 ? "1 vault" : `${vaults.length} vaults`}
            </Txt>
            <CaretDownIcon size={14} color={c.textMuted} style={open ? styles.flip : undefined} />
          </Row>
        ) : null}
      </Row>
      {open ? (
        <View style={styles.list}>
          <Divider />
          {vaults.map((v) => (
            <Row key={v.id} gap={space.sm} style={styles.vault}>
              <VaultGlyph category={v.category} size={32} />
              <Txt v="bodyM" numberOfLines={1} style={styles.flex}>
                {v.name}
              </Txt>
              <Txt v="numM">{fmt(v.available, currency)}</Txt>
            </Row>
          ))}
        </View>
      ) : null}
    </>
  );
  if (!canOpen)
    return (
      <View accessible accessibilityLabel={label} style={cardStyle}>
        {content}
      </View>
    );
  return (
    <Press
      onPress={() => setOpen((v) => !v)}
      scaleTo={0.98}
      accessibilityLabel={open ? `${label} ${vaults.map((v) => `${v.name}, ${fmt(v.available, currency)}`).join(". ")}` : label}
      accessibilityHint={open ? "Hides the vaults it uses" : "Shows the vaults it uses"}
      accessibilityState={{ expanded: open }}
      style={cardStyle}
    >
      {content}
    </Press>
  );
}

/** Feature 6: the guaranteed emergency floor, stated where people look for it. */
export function GuaranteeLine() {
  const { c } = useTheme();
  return (
    <Row gap={space.xs} style={styles.line}>
      <ShieldCheckIcon size={20} color={c.textMuted} />
      <Txt v="bodyM" color="textMuted" style={styles.flex}>
        A proof under review never blocks emergency money.
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    gap: space.xxs,
    justifyContent: "center",
  },
  line: { alignItems: "flex-start" },
  flex: { flex: 1 },
  count: { paddingTop: 3 },
  flip: { transform: [{ rotate: "180deg" }] },
  list: { gap: space.xs, marginTop: space.xs },
  vault: { minHeight: layout.hit },
});
