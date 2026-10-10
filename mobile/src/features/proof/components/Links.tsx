import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeftIcon, HeadsetIcon, type Icon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { layout, useTheme } from "@/theme";

/** An inline text link with a 44 pt target. */
export function TextLink({ label, onPress, icon: IconCmp, hint }: { label: string; onPress: () => void; icon?: Icon; hint?: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="link" accessibilityLabel={label} accessibilityHint={hint} hitSlop={6} style={styles.link}>
      {IconCmp ? <IconCmp size={20} color={c.accent} /> : null}
      <Txt v="labelM" color="accent">
        {label}
      </Txt>
    </Press>
  );
}

/**
 * "Talk to a person" — a human within two taps from every negative outcome. From a sheet, use
 * `replace` so Support opens as its own screen rather than inside the sheet.
 */
export function TalkToPerson({ replace }: { replace?: boolean }) {
  return <TextLink label="Talk to a person" icon={HeadsetIcon} onPress={() => (replace ? router.replace("/support") : router.push("/support"))} />;
}

/** Header for pushed screens shown without the native header: Back top-leading (44 pt). */
export function BackHeader({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.header}>
      <Press
        accessibilityLabel="Back"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={[styles.back, { backgroundColor: c.surfaceRaised }]}
      >
        <ArrowLeftIcon size={22} color={c.text} weight="bold" />
      </Press>
      {label ? (
        <Txt v="labelM" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: layout.hit, alignSelf: "flex-start" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: layout.hit },
  back: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
});
