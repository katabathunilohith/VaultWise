import { StyleSheet, View } from "react-native";
import { CheckCircleIcon } from "@/components/icons";
import { Banner, Button, PracticeBadge, Stack, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { space, useTheme } from "@/theme";

/** Calm confirmation: outcome first, then the detail. No celebration — this is money going out. */
export function FlowDone({ title, body }: { title: string; body: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.done} accessibilityLiveRegion="polite">
      <View>
        <PracticeBadge />
      </View>
      <CheckCircleIcon size={56} color={c.success} weight="fill" />
      <Txt v="headline" align="center" accessibilityRole="header">
        {title}
      </Txt>
      <Txt v="bodyL" color="textMuted" align="center">
        {body}
      </Txt>
    </View>
  );
}

/**
 * The server's own wording for the failures people can hit here uses ledger terms ("Insufficient
 * funds in …", "risk profile"), so those get plain words; anything else is already customer-safe.
 */
function plainReason(error: unknown) {
  const raw = errorMessage(error);
  if (/insufficient/i.test(raw)) return "Your bank doesn't have enough money for this.";
  if (/risk profile/i.test(raw)) return "Your risk quiz needs finishing first.";
  return raw;
}

/** A failed submit: what happened, that nothing changed, and a person to ask. */
export function FlowError({ error, nothingChanged, onAskPerson }: { error: unknown; nothingChanged: string; onAskPerson: () => void }) {
  return (
    <Stack gap={space.xs}>
      <Banner tone="danger" title="That didn't go through" body={`${plainReason(error)} ${nothingChanged}`} />
      <Button label="Ask a person" variant="ghost" size="sm" onPress={onAskPerson} style={{ alignSelf: "flex-start" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  done: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.md },
});
