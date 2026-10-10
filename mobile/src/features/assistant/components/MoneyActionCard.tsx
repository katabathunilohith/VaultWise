import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LockIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { actionHref, actionLabel, type MoneyAction } from "../intents";

/**
 * The assistant never moves money. When asked to, it points to the normal flow, where the
 * person checks the details and confirms (with their PIN where the flow needs it).
 */
export function MoneyActionCard({ action }: { action: MoneyAction }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <LockIcon size={20} color={c.textMuted} />
        <Txt v="labelL" style={styles.flex}>
          I can&apos;t move money from chat. Do it here:
        </Txt>
      </View>
      <Txt v="bodyM" color="textMuted">
        It opens the usual screen, where you check the details and confirm.
      </Txt>
      <Button label={actionLabel(action)} variant="tonal" size="md" onPress={() => router.push(actionHref(action))} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm, alignSelf: "stretch" },
  head: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  flex: { flex: 1 },
});
