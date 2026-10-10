import { useRef, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Press, Txt, type ButtonVariant } from "@/components/ui";
import type { Icon } from "@/components/icons";
import { layout, radius, space, useTheme } from "@/theme";

interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
}

/**
 * A small confirmation/explanation dialog. Works the same on iOS, Android and web (RN Alert is a
 * no-op on web). Actions stack full width; put the safe choice last so it sits nearest the thumb.
 */
export function Dialog({
  visible,
  title,
  body,
  children,
  actions,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  actions: DialogAction[];
  onDismiss: () => void;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.center}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityViewIsModal>
          <Txt v="titleL" accessibilityRole="header">
            {title}
          </Txt>
          {body ? (
            <Txt v="bodyM" color="textMuted">
              {body}
            </Txt>
          ) : null}
          {children}
          <View style={styles.actions}>
            {actions.map((a) => (
              <Button key={a.label} label={a.label} variant={a.variant ?? "tonal"} size="md" loading={a.loading} onPress={a.onPress} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface MenuItem {
  label: string;
  icon: Icon;
  onPress: () => void;
  destructive?: boolean;
  hint?: string;
}

/**
 * The header "…" menu: a small card under the top-trailing button. Destructive items go last.
 * On iOS a chosen item runs once the menu has finished closing, because UIKit can't present the
 * next modal (a dialog or editor) while this one is still animating away.
 */
export function ActionMenu({ visible, items, onDismiss }: { visible: boolean; items: MenuItem[]; onDismiss: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  const choose = (action: () => void) => {
    onDismiss();
    if (Platform.OS === "ios") pending.current = action;
    else action();
  };
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      onDismiss={runPending}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        onPress={onDismiss}
        accessibilityLabel="Close menu"
        accessibilityRole="button"
      />
      <View
        accessibilityViewIsModal
        style={[styles.menu, { top: insets.top + layout.hit + space.md, backgroundColor: c.surfaceRaised, borderColor: c.border }]}
      >
        {items.map((item, i) => (
          <Press
            key={item.label}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            accessibilityHint={item.hint}
            scaleTo={0.99}
            onPress={() => choose(item.onPress)}
            style={[styles.menuItem, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <item.icon size={22} color={item.destructive ? c.danger : c.text} />
            <Txt v="labelL" color={item.destructive ? "danger" : "text"} style={{ flex: 1 }}>
              {item.label}
            </Txt>
          </Press>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: layout.gutter },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  actions: { gap: space.xs, marginTop: space.xs },
  menu: {
    position: "absolute",
    right: layout.gutter,
    minWidth: 248,
    maxWidth: 320,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: layout.rowMin, paddingHorizontal: space.md },
});
