import { useEffect, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { ImagesIcon, ReceiptIcon } from "@/components/icons";
import { Banner, Button, ModalScreen, PracticeBadge, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { DocChecklist, proofChecklist } from "../components/DocChecklist";
import { PAPER_MUTED, PaperCard } from "../components/Paper";
import { amountText } from "../describe";
import { ArrowCounterClockwiseIcon } from "../icons";
import type { FlowVault, PickedDoc, StepNav } from "./types";

const TICK_MS = 380;

const SECONDARY: Record<PickedDoc["source"], { label: string; icon: typeof ImagesIcon }> = {
  camera: { label: "Retake", icon: ArrowCounterClockwiseIcon },
  library: { label: "Choose another", icon: ImagesIcon },
  sample: { label: "Pick another sample", icon: ReceiptIcon },
};

/**
 * Review before sending: the photo on paper and the checklist ticking through. The ticks are a
 * prompt to look, not the check itself, and the copy says so; the real check runs on send.
 */
export function ReviewStep({
  nav,
  doc,
  vault,
  amount,
  maxDocAgeDays,
  submitting,
  error,
  onUse,
  onSecondary,
}: {
  nav: StepNav;
  doc: PickedDoc;
  vault: FlowVault;
  amount: number;
  maxDocAgeDays: number;
  submitting: boolean;
  error: string | null;
  onUse: () => void;
  onSecondary: () => void;
}) {
  const { cat } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const list = proofChecklist({ category: vault.proofCategory, amountText: amountText(amount, vault.currency), maxDocAgeDays });
  const [ticked, setTicked] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTicked((n) => (n >= list.items.length ? n : n + 1)), TICK_MS);
    return () => clearInterval(t);
  }, [list.items.length]);
  const allTicked = ticked >= list.items.length;

  const aspect = doc.width && doc.height ? doc.width / doc.height : 3 / 4;
  const boxW = Math.min(W, layout.maxContentWidth) - layout.gutter * 2 - space.md * 2;
  const boxH = Math.min(H * 0.42, boxW / aspect);
  const second = SECONDARY[doc.source];
  const isSample = doc.source === "sample";

  return (
    <ModalScreen
      title="Check the photo"
      onClose={nav.onClose}
      back={nav.onBack}
      footer={
        <>
          <Button label={second.label} icon={second.icon} variant="tonal" size="md" onPress={onSecondary} disabled={submitting} />
          <Button label={isSample ? "Use this sample" : "Use photo"} armOnMount onPress={onUse} loading={submitting} accessibilityHint="Sends it to be checked" />
        </>
      }
    >
      <PracticeBadge />
      <PaperCard accessibilityLabel={doc.label ? `Sample: ${doc.label}` : "Your photo of the bill"}>
        <View style={[styles.photo, { height: boxH }]}>
          <Image source={doc.preview} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
        </View>
        {doc.label ? (
          <Txt v="caption" color={PAPER_MUTED} align="center">
            Sample · {doc.label}
          </Txt>
        ) : null}
      </PaperCard>
      <View style={{ gap: space.sm }}>
        <Txt v="titleM" accessibilityRole="header">
          Can you see all of this?
        </Txt>
        <DocChecklist items={list.items} ticked={ticked} color={cat(vault.category).tint} />
        <Txt v="bodyM" color="textMuted" accessibilityLiveRegion="polite">
          {allTicked ? "Looks clear. The full check runs when you send it." : "Looking it over…"}
        </Txt>
      </View>
      {error ? <Banner tone="danger" title="That didn't send" body={error} /> : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", borderRadius: radius.sm, overflow: "hidden" },
});
