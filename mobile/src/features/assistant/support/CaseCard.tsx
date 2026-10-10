import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CaretDownIcon } from "@/components/icons";
import { Button, Press, StatusPill, Timeline, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { caseBadge, caseSteps } from "./caseSteps";
import { closeCase, type SupportCase } from "./cases";
import { clockTime } from "./time";
import { topicLabel } from "./topics";

/** One open case: topic, status and reply time; tap to see the message, timeline and close it. */
export function CaseCard({ item, now, initiallyOpen = false }: { item: SupportCase; now: number; initiallyOpen?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const [confirming, setConfirming] = useState(false);
  const badge = caseBadge(item, now);
  const due = clockTime(item.replyBy, now);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Press
        onPress={() => {
          setOpen((o) => !o);
          setConfirming(false);
        }}
        scaleTo={0.99}
        accessibilityLabel={`${topicLabel(item.topic)}, case ${item.id}. ${badge.label}. Reply by ${due}`}
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <View style={styles.flex}>
          <Txt v="labelL">{topicLabel(item.topic)}</Txt>
          <View style={styles.sub}>
            <Txt v="numS" color="textMuted">
              {item.id}
            </Txt>
            <Txt v="caption" color="textMuted">
              Reply by {due}
            </Txt>
          </View>
        </View>
        <StatusPill tone={badge.tone} label={badge.label} />
        <CaretDownIcon size={18} color={c.textMuted} style={open ? styles.flip : undefined} />
      </Press>

      {open ? (
        <View style={styles.body}>
          {item.message ? <Txt v="bodyM">{item.message}</Txt> : null}
          {item.ref ? (
            <View style={styles.sub}>
              <Txt v="caption" color="textMuted">
                Reference
              </Txt>
              <Txt v="numS">{item.ref}</Txt>
            </View>
          ) : null}
          <Timeline steps={caseSteps(item, now)} />
          {confirming ? (
            <View style={styles.confirm}>
              <Txt v="bodyM">Close case {item.id}? You can open a new one any time.</Txt>
              <Button label="Keep it open" variant="tonal" size="md" onPress={() => setConfirming(false)} />
              <Button label="Close case" variant="dangerOutline" size="md" onPress={() => void closeCase(item.id)} />
            </View>
          ) : (
            <Button label="Close this case" variant="ghost" size="sm" onPress={() => setConfirming(true)} style={styles.start} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: layout.rowMin, paddingVertical: space.sm },
  sub: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  flip: { transform: [{ rotate: "180deg" }] },
  body: { gap: space.md, paddingBottom: space.md },
  confirm: { gap: space.xs },
  start: { alignSelf: "flex-start" },
});
