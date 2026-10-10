import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CameraIcon, CaretDownIcon, FileTextIcon, ImagesIcon } from "@/components/icons";
import { Banner, Button, Card, Divider, ListRow, ModalScreen, PracticeBadge, ScreenSkeleton, Skeleton, Stack, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useEmergency, useInvalidateMoney, useSamples } from "@/lib/api/hooks";
import type { EmergencyHistoryItem, Sample } from "@/lib/api/types";
import { sampleSource } from "@/lib/api/samples";
import { haptic } from "@/lib/haptics";
import { radius, space, useTheme } from "@/theme";
import { receiptDueText, receiptInText, receiptOwed } from "../copy";
import { fmt, shortDate } from "../format";
import { go, leave } from "../routes";
import { choosePhoto, pickSample, takePhoto, type Picked, type PickResult } from "./pickers";

/**
 * Add the receipt for an emergency request, after the money has gone: camera, photo library or a
 * practice sample → upload → the proof screen tracks the check. Never blocks money already sent.
 */
export function ReceiptUpload({ emergencyId }: { emergencyId: string }) {
  const q = useEmergency();
  if (q.isPending)
    return (
      <Shell>
        <ScreenSkeleton />
      </Shell>
    );
  // The request may not be in the list yet (it was just made); the upload works either way.
  const item = q.data?.history.find((h) => h.id === emergencyId) ?? null;
  return <Upload emergencyId={emergencyId} item={item} currency={q.data?.currency ?? null} />;
}

function Shell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <ModalScreen title="Add receipt" onClose={go.close} headerRight={<PracticeBadge compact />} footer={footer}>
      {children}
    </ModalScreen>
  );
}

const PICK_ERRORS: Record<Exclude<PickResult, { ok: true }>["reason"], string | null> = {
  cancelled: null,
  denied: "Camera access is off. Choose a photo instead, or allow camera access in your phone's settings.",
  unavailable: "That isn't available on this device. Try another option.",
};

function Upload({ emergencyId, item, currency }: { emergencyId: string; item: EmergencyHistoryItem | null; currency: string | null }) {
  const invalidate = useInvalidateMoney();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const alreadyIn = item ? !receiptOwed(item) : false;

  const pick = async (how: () => Promise<PickResult>) => {
    setProblem(null);
    const r = await how();
    if (r.ok) setPicked(r.picked);
    else setProblem(PICK_ERRORS[r.reason]);
  };

  const send = async () => {
    if (!picked || sending) return;
    setSending(true);
    setProblem(null);
    try {
      const r = await api.emergencyReceipt(emergencyId, picked.file);
      void invalidate();
      leave.proof(r.id);
    } catch (e) {
      haptic("error");
      setProblem(e instanceof ApiError && e.status === 409 ? "A receipt for this request is already being checked." : errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const footer = alreadyIn ? (
    <Button label="Done" armOnMount onPress={go.close} />
  ) : picked ? (
    <>
      <Button label="Choose a different one" variant="tonal" size="md" onPress={() => setPicked(null)} disabled={sending} />
      <Button label="Send receipt" armOnMount loading={sending} onPress={() => void send()} />
    </>
  ) : undefined;

  return (
    <Shell footer={footer}>
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          Add your receipt
        </Txt>
        <Txt v="bodyL">{item && currency ? `For ${fmt(item.amount, currency)} · ${item.reason}, requested ${shortDate(item.createdAt)}.` : "For your emergency request."}</Txt>
        <Txt v="bodyM" color="textMuted">
          {item && !alreadyIn ? `${receiptDueText(item)} ` : ""}It never blocks money you&apos;ve already had.
        </Txt>
      </Stack>

      {alreadyIn && item ? (
        <Banner tone="info" title={receiptInText(item)} body="There's nothing else to add for this request." />
      ) : null}
      {problem ? <Banner tone="warning" title={problem} /> : null}

      {alreadyIn ? null : picked ? <PaperPreview picked={picked} /> : <Options onPick={(how) => void pick(how)} onSample={(s) => setPicked(pickSample(s))} />}
    </Shell>
  );
}

function PaperPreview({ picked }: { picked: Picked }) {
  const { c } = useTheme();
  return (
    <View style={[styles.paper, { backgroundColor: c.paper, borderColor: c.border }]}>
      <Image source={picked.preview} style={styles.image} contentFit="contain" accessibilityLabel="Your receipt" />
    </View>
  );
}

function Options({ onPick, onSample }: { onPick: (how: () => Promise<PickResult>) => void; onSample: (s: Sample) => void }) {
  const { c } = useTheme();
  const [showSamples, setShowSamples] = useState(false);
  return (
    <Card>
      <ListRow icon={CameraIcon} title="Take a photo" subtitle="Lay it flat, in good light" onPress={() => onPick(takePhoto)} />
      <Divider />
      <ListRow icon={ImagesIcon} title="Choose a photo" subtitle="From your photos or files" onPress={() => onPick(choosePhoto)} />
      <Divider />
      <ListRow
        icon={FileTextIcon}
        title="Use a practice sample"
        subtitle="In Practice mode, try a ready-made receipt"
        trailing={<CaretDownIcon size={18} color={c.textMuted} style={showSamples ? styles.flip : undefined} />}
        onPress={() => setShowSamples((v) => !v)}
        accessibilityLabel={`Use a practice sample, ${showSamples ? "expanded" : "collapsed"}`}
      />
      {showSamples ? <Samples onSample={onSample} /> : null}
    </Card>
  );
}

function Samples({ onSample }: { onSample: (s: Sample) => void }) {
  const { c } = useTheme();
  const samples = useSamples();
  if (samples.isPending)
    return (
      <Stack gap={space.xs}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Stack>
    );
  if (samples.isError || !samples.data?.samples.length)
    return (
      <Txt v="bodyM" color="textMuted">
        Samples aren&apos;t available right now. Take or choose a photo instead.
      </Txt>
    );
  return (
    <View style={styles.samples}>
      {samples.data.samples.map((s) => (
        <ListRow
          key={s.key}
          title={s.label}
          subtitle="Practice sample"
          leading={
            <View style={[styles.thumb, { backgroundColor: c.paper, borderColor: c.border }]}>
              <Image source={sampleSource(s.key)} style={styles.thumbImg} contentFit="cover" accessible={false} />
            </View>
          }
          onPress={() => onSample(s)}
          accessibilityLabel={`Use sample: ${s.label}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.sm, overflow: "hidden" },
  image: { width: "100%", height: 340 },
  flip: { transform: [{ rotate: "180deg" }] },
  samples: { paddingLeft: space.xs },
  thumb: { width: 40, height: 52, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
});
