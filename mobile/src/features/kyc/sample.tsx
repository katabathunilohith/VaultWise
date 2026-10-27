import { StyleSheet, View } from "react-native";
import { UserIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import type { UploadFile } from "@/lib/api/types";
import { radius, space, useTheme } from "@/theme";

/**
 * The Practice sample ID: a plain card drawn in code that says what it is. It deliberately looks
 * like no real government ID (no emblem, no colours, no layout of a real card). Its upload is
 * only a name: the Practice simulator reads the file name, and live mode never offers it.
 */
export const SAMPLE_ID_FILE: UploadFile = { uri: "sample-id", name: "sample-id.jpg", type: "image/jpeg" };

export function SampleIdCard() {
  const { c } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: c.paper, borderColor: c.borderStrong }]}
      accessible
      accessibilityLabel="Sample ID for Practice only. Not a real document."
    >
      <Txt v="labelL" color={c.ink}>
        SAMPLE ID · Practice only
      </Txt>
      <View style={styles.row}>
        <View style={[styles.photo, { borderColor: c.ink }]}>
          <UserIcon size={34} color={c.ink} />
        </View>
        <View style={styles.lines}>
          <Txt v="caption" color={c.ink}>
            Name: Alex Morgan
          </Txt>
          <Txt v="caption" color={c.ink}>
            Number: ••••4821
          </Txt>
          <Txt v="caption" color={c.ink}>
            Not a real document.
          </Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 2, borderStyle: "dashed", padding: space.md, gap: space.sm },
  row: { flexDirection: "row", gap: space.md, alignItems: "center" },
  photo: { width: 64, height: 76, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  lines: { flex: 1, gap: 4 },
});
