import { StyleSheet, View } from "react-native";
import { SealCheckIcon } from "@/components/icons";
import { Banner, Row, StatusPill, Txt } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { space } from "@/theme";
import { MerchantAvatar } from "../MerchantAvatar";

/** Who you're paying, and that Vaultwise has verified them. */
export function MerchantHeader({ intent }: { intent: PaymentIntent }) {
  return (
    <View style={styles.wrap}>
      <Row gap={space.md} style={styles.top}>
        <MerchantAvatar name={intent.merchant.name} size={56} />
        <View style={styles.text}>
          <Txt v="titleL" accessibilityRole="header">
            {intent.merchant.name}
          </Txt>
          {intent.merchant.city ? (
            <Txt v="bodyM" color="textMuted">
              {intent.merchant.city}
            </Txt>
          ) : null}
          <StatusPill tone="success" label="Verified merchant" icon={SealCheckIcon} />
        </View>
      </Row>
      {intent.dryRun ? (
        <Banner
          tone="info"
          title="Merchant checkout isn't live yet"
          body="This is a practice run with your own vaults. Nothing is paid, and your balances stay the same."
        />
      ) : intent.simulated ? (
        <Banner tone="info" title="Merchant checkout isn't live yet" body="This payment is simulated, so no real money moves." />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  top: { alignItems: "flex-start" },
  text: { flex: 1, gap: 4 },
});
