import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircleIcon } from "@/components/icons";
import { Button, Chip, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { REPORT_REASONS, saveReport, type ReportReason } from "../reports";
import type { AssistantMessage } from "../useChat";

/**
 * Report an assistant reply: Wrong · Unsafe · Not helpful. A single sheet over the chat (never
 * stacked). Reports are kept on this device until a reporting service exists.
 */
export function ReportSheet({ target, onClose, onReported }: { target: AssistantMessage | null; onClose: () => void; onReported: (id: string) => void }) {
  const { c } = useTheme();
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        {/* Keyed by reply so the choice resets for each report. */}
        {target ? <SheetBody key={target.id} target={target} onClose={onClose} onReported={onReported} /> : null}
      </View>
    </Modal>
  );
}

function SheetBody({ target, onClose, onReported }: { target: AssistantMessage; onClose: () => void; onReported: (id: string) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [state, setState] = useState<"choosing" | "sending" | "sent">("choosing");

  const submit = async () => {
    if (!reason) return;
    setState("sending");
    await saveReport(reason, { text: target.text, tone: target.tone });
    onReported(target.id);
    setState("sent");
  };

  return (
    <View
      style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border, paddingBottom: insets.bottom + layout.ctaBottomGap }]}
      accessibilityViewIsModal
    >
      {state === "sent" ? (
        <View style={styles.sent} accessibilityLiveRegion="polite">
          <CheckCircleIcon size={28} color={c.success} weight="fill" />
          <Txt v="titleM" align="center" accessibilityRole="header">
            Thanks — a person will review this.
          </Txt>
          <Button label="Done" variant="tonal" size="md" onPress={onClose} style={styles.stretch} />
        </View>
      ) : (
        <>
          <Txt v="titleL" accessibilityRole="header">
            Report this reply
          </Txt>
          <Txt v="bodyM" color="textMuted">
            What&apos;s wrong with it? A person on our team reads every report.
          </Txt>
          <View style={styles.reasons} accessibilityRole="radiogroup">
            {REPORT_REASONS.map((r) => (
              <Chip key={r.key} label={r.label} tall selected={reason === r.key} onPress={() => setReason(r.key)} />
            ))}
          </View>
          <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
          <Button label="Send report" disabled={!reason} loading={state === "sending"} onPress={() => void submit()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
    gap: space.sm,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
  reasons: { gap: space.xs },
  sent: { alignItems: "center", gap: space.sm, paddingVertical: space.md },
  stretch: { alignSelf: "stretch" },
});
