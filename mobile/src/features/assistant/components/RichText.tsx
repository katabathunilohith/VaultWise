import { Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Txt } from "@/components/ui";
import { fonts } from "@/theme";

/**
 * Just enough Markdown for assistant replies (the server asks for short paragraphs or bullets):
 * paragraphs, "-"/"*"/"•" and "1." lists, "#" headings and **bold**. Anything else shows as
 * plain text, so a half-streamed reply never breaks the layout.
 */
export function RichText({ text, color }: { text: string; color: string }) {
  const blocks: ReactNode[] = [];
  text
    .replace(/\r/g, "")
    .split("\n")
    .forEach((raw, i) => {
      const line = raw.trimEnd();
      if (!line.trim()) return;
      const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (heading) {
        blocks.push(
          <Txt key={i} v="labelL" color={color}>
            {inline(heading[1])}
          </Txt>,
        );
        return;
      }
      const item = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (item) {
        const marker = /\d/.test(item[1]) ? item[1].replace(")", ".") : "•";
        blocks.push(
          <View key={i} style={styles.item}>
            <Txt v="bodyL" color={color} style={styles.marker} importantForAccessibility="no">
              {marker}
            </Txt>
            <Txt v="bodyL" color={color} style={styles.itemText}>
              {inline(item[2])}
            </Txt>
          </View>,
        );
        return;
      }
      blocks.push(
        <Txt key={i} v="bodyL" color={color}>
          {inline(line)}
        </Txt>,
      );
    });
  return <View style={styles.wrap}>{blocks}</View>;
}

/** **bold** → semibold; stray backticks dropped. */
function inline(s: string): ReactNode {
  return s
    .replace(/`/g, "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <Text key={i} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  item: { flexDirection: "row", gap: 8 },
  marker: { minWidth: 14 },
  itemText: { flex: 1 },
  bold: { fontFamily: fonts.bodySemi },
});
