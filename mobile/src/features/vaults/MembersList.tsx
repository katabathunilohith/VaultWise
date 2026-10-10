import { StyleSheet, View } from "react-native";
import { Divider, MoneyText, Txt } from "@/components/ui";
import type { VaultMember } from "@/lib/api/types";
import { money } from "@/lib/money";
import { layout, space, useTheme } from "@/theme";
import { initials } from "./format";

/** Joint vault members: who they are and what each has added. Visible only to members. */
export function MembersList({ members, currency, you }: { members: VaultMember[]; currency: string; you?: string }) {
  const { c } = useTheme();
  if (!members.length)
    return (
      <Txt v="bodyM" color="textMuted">
        Members show here once they join.
      </Txt>
    );
  return (
    <View>
      {members.map((m, i) => {
        const isYou = !!you && m.name === you;
        const role = m.role === "owner" ? "Owner" : "Co-saver";
        return (
          <View key={m.id}>
            {i > 0 ? <Divider /> : null}
            <View
              style={styles.row}
              accessible
              accessibilityLabel={`${m.name}${isYou ? ", you" : ""}, ${role}, added ${money(m.contributed, currency)}`}
            >
              <View style={[styles.avatar, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
                <Txt v="labelM">{initials(m.name)}</Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="labelL" numberOfLines={1}>
                  {m.name}
                  {isYou ? " (you)" : ""}
                </Txt>
                <Txt v="caption" color="textMuted">
                  {role}
                </Txt>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <MoneyText value={m.contributed} currency={currency} />
                <Txt v="caption" color="textMuted">
                  added
                </Txt>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.rowMin, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
