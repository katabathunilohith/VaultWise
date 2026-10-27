import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { useVault } from "@/lib/api/hooks";
import type { VaultCategory } from "@/lib/api/types";
import { categoryOf } from "@/lib/categories";
import { layout, space, useTheme } from "@/theme";
import { ReleaseContract } from "./ReleaseContract";

/**
 * The rules sheet the "i" buttons open: what unlocks a category, or a particular vault. For a
 * vault it reads the vault, so a borrowed template or an own rule is shown as it really is.
 */
export function RulesSheet({ category, template, vaultId }: { category?: string; template?: string; vaultId?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const vault = useVault(vaultId).data?.vault;
  const meta = categoryOf(vault?.category ?? category);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.header}>
        <Image source={meta.object3d} style={styles.object} contentFit="contain" accessible={false} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="caption" color="textMuted">
            {vault ? `${meta.label} vault` : "Purpose"}
          </Txt>
          <Txt v="titleL" accessibilityRole="header" numberOfLines={2}>
            {vault ? vault.name : `${meta.label} rules`}
          </Txt>
        </View>
        <Press accessibilityLabel="Close" hitSlop={8} onPress={close} style={[styles.close, { backgroundColor: c.surfaceRaised }]}>
          <XIcon size={20} color={c.text} weight="bold" />
        </Press>
      </View>
      <ReleaseContract
        category={vault?.category ?? (meta.key as VaultCategory)}
        template={vault ? vault.template : (template ?? null)}
        customRule={vault?.customRule ?? null}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: space.xl, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  object: { width: 48, height: 48 },
  close: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
});
