import { StyleSheet, View } from "react-native";
import { PracticeBadge, Skeleton, Txt } from "@/components/ui";
import type { Me } from "@/lib/api/types";
import { radius, space, useTheme } from "@/theme";
import { CalmError } from "../controls";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** Avatar, name, email, and the country (flag + market) whose rules the account follows. */
export function ProfileHeader({ me, loading, error, onRetry }: { me: Me | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  const { c } = useTheme();
  if (loading)
    return (
      <View style={styles.wrap} accessibilityLabel="Loading your profile">
        <Skeleton height={64} width={64} r={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={22} width="60%" />
          <Skeleton height={16} width="80%" />
        </View>
      </View>
    );
  if (error || !me) return <CalmError error={error} onRetry={onRetry} title="Your profile didn't load" />;
  if (!me.onboarded)
    return (
      <View style={styles.wrap}>
        <Txt v="bodyM" color="textMuted">
          No account on this server yet.
        </Txt>
      </View>
    );
  const { user } = me;
  const country = user.country;
  const market = country && country.marketName && country.marketName !== country.name ? `${country.marketName} rules` : null;
  const place = country ? [country.name, market, user.currency].filter(Boolean).join(" · ") : null;
  return (
    <View style={styles.wrap}>
      <View style={[styles.avatar, { backgroundColor: c.accentSoft }]} accessibilityElementsHidden importantForAccessibility="no">
        <Txt v="titleL" color="accent">
          {initials(user.name)}
        </Txt>
      </View>
      <View style={styles.text}>
        <Txt v="titleL" numberOfLines={1} accessibilityRole="header">
          {user.name}
        </Txt>
        <Txt v="bodyM" color="textMuted" numberOfLines={1}>
          {user.email || "No email added"}
        </Txt>
        {country ? (
          <Txt v="caption" color="textMuted" accessibilityLabel={place ?? undefined}>
            {`${country.flag}  ${place}`}
          </Txt>
        ) : null}
        <View style={{ marginTop: 4 }}>
          <PracticeBadge />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
});
