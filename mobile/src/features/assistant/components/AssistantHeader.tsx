import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";

/**
 * Close (top-leading) · "Vaultwise AI" with an AI label (EU AI Act Art. 50: say it's AI at the
 * first interaction) · New chat (top-trailing, an occasional action, so header-only is fine).
 */
export function AssistantHeader({ onClose, onNewChat, canReset }: { onClose: () => void; onNewChat: () => void; canReset: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.side}>
        <Press accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={[styles.close, { backgroundColor: c.surfaceRaised }]}>
          <XIcon size={22} color={c.text} weight="bold" />
        </Press>
      </View>
      <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel="Vaultwise AI. AI assistant">
        <Txt v="titleM" numberOfLines={1}>
          Vaultwise AI
        </Txt>
        <View style={[styles.aiPill, { backgroundColor: c.accentSoft, borderColor: c.accent }]}>
          <Txt v="micro" color="accent">
            AI
          </Txt>
        </View>
      </View>
      <View style={[styles.side, styles.trailing]}>
        <Press
          accessibilityLabel="New chat"
          accessibilityHint="Clears this conversation"
          accessibilityState={{ disabled: !canReset }}
          disabled={!canReset}
          onPress={onNewChat}
          hitSlop={8}
          style={[styles.newChat, { opacity: canReset ? 1 : 0.45 }]}
        >
          <Txt v="labelM" color="accent">
            New chat
          </Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, paddingBottom: space.xs },
  side: { flex: 1, alignItems: "flex-start" },
  trailing: { alignItems: "flex-end" },
  close: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  title: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  aiPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth * 2 },
  newChat: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
});
