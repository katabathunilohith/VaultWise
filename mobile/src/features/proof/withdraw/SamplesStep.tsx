import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CaretRightIcon } from "@/components/icons";
import { Card, EmptyState, ModalScreen, PracticeBadge, Row, Skeleton, Txt } from "@/components/ui";
import { useSamples } from "@/lib/api/hooks";
import { sampleSource } from "@/lib/api/samples";
import type { Sample } from "@/lib/api/types";
import { categoryOf } from "@/lib/categories";
import { radius, space, useTheme } from "@/theme";
import { CalmError } from "../components/CalmError";
import type { FlowVault, StepNav } from "./types";

/** What to expect from a sample, in plain words (the server's notes use internal terms). */
function expectation(s: Sample, vaultCategory: string) {
  const e = s.expect.toLowerCase();
  if (/tamper|altered|edited/.test(e)) return "Won't pass. Its total has been changed.";
  if (/mismatch|declin/.test(e)) return "Won't pass. It isn't a bill any vault covers.";
  const meta = categoryOf(s.category);
  if (s.category !== vaultCategory) return `Made for a ${meta.short} vault, so it may not pass here.`;
  return `Should pass from a ${meta.short} vault.`;
}

/** Sample bills, including the ones built to fail, so every outcome can be tried. */
export function SamplesStep({ nav, vault, onPick }: { nav: StepNav; vault: FlowVault; onPick: (s: Sample) => void }) {
  const { c } = useTheme();
  const q = useSamples();
  return (
    <ModalScreen title="Sample bills" onClose={nav.onClose} back={nav.onBack}>
      <PracticeBadge />
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Pick a sample bill
        </Txt>
        <Txt v="bodyM" color="textMuted">
          It goes through the same checks as a real one. Some are made to fail, so you can see what happens.
        </Txt>
      </View>
      {q.isPending ? (
        <View style={{ gap: space.sm }} accessibilityLabel="Loading samples">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} r={radius.lg} />
          ))}
        </View>
      ) : q.isError ? (
        <CalmError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.samples.length === 0 ? (
        <EmptyState title="No sample bills right now" body="Go back and send a photo of the bill instead." />
      ) : (
        <View style={{ gap: space.sm }}>
          {q.data.samples.map((s) => (
            <Card key={s.key} onPress={() => onPick(s)} accessibilityLabel={`${s.label}. ${expectation(s, vault.proofCategory)}`}>
              <Row gap={14}>
                <View style={[styles.thumb, { backgroundColor: c.paper, borderColor: c.border }]}>
                  <Image source={sampleSource(s.key)} style={styles.thumbImg} contentFit="cover" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="labelL">{s.label}</Txt>
                  <Txt v="bodyM" color="textMuted">
                    {expectation(s, vault.proofCategory)}
                  </Txt>
                </View>
                <CaretRightIcon size={18} color={c.textMuted} />
              </Row>
            </Card>
          ))}
        </View>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 72, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumbImg: { width: "100%", height: "100%" },
});
