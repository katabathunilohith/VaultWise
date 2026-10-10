import { Platform, View } from "react-native";
import { CameraIcon, ImagesIcon, ReceiptIcon } from "@/components/icons";
import { Banner, Button, Card, ListRow, ModalScreen, PracticeBadge, Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";
import { DocChecklist, proofChecklist } from "../components/DocChecklist";
import { amountText } from "../describe";
import type { FlowVault, StepNav } from "./types";

const canScan = Platform.OS !== "web";

/** Step 3: what the bill needs, then three ways to provide it. */
export function ProofOptionsStep({
  nav,
  vault,
  amount,
  payee,
  maxDocAgeDays,
  lastDecline,
  pickError,
  busy,
  onScan,
  onChoose,
  onSamples,
}: {
  nav: StepNav;
  vault: FlowVault;
  amount: number;
  payee: string;
  maxDocAgeDays: number;
  lastDecline: string | null;
  pickError: string | null;
  busy: boolean;
  onScan: () => void;
  onChoose: () => void;
  onSamples: () => void;
}) {
  const { c, cat } = useTheme();
  const list = proofChecklist({ category: vault.proofCategory, amountText: amountText(amount, vault.currency), maxDocAgeDays });
  return (
    <ModalScreen
      title={`Withdraw · ${vault.name}`}
      onClose={nav.onClose}
      back={nav.onBack}
      footer={
        canScan ? (
          <>
            <Button label="Choose a photo" variant="tonal" size="md" icon={ImagesIcon} onPress={onChoose} disabled={busy} />
            <Button label="Scan the bill" icon={CameraIcon} armOnMount onPress={onScan} loading={busy} />
          </>
        ) : (
          <Button label="Choose a photo" icon={ImagesIcon} armOnMount onPress={onChoose} loading={busy} />
        )
      }
    >
      <PracticeBadge />
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Show us the bill.
        </Txt>
        <Txt v="bodyL" color="textMuted">
          We’ll match it to {vault.name} and pay {payee || "the payee"}.
        </Txt>
      </View>
      {lastDecline ? <Banner tone="warning" title="The last document wasn't approved" body={lastDecline} /> : null}
      {pickError ? <Banner tone="danger" title="Couldn't open your photos" body={pickError} /> : null}
      <Card>
        <Txt v="titleM">What the bill needs</Txt>
        <Txt v="bodyM" color="textMuted">
          {list.hint}, with:
        </Txt>
        <DocChecklist items={list.items} color={cat(vault.category).tint} />
      </Card>
      <Card>
        <ListRow
          title="Use a sample"
          subtitle="Practice with one of our bills, including ones that won't pass"
          leading={<ReceiptIcon size={24} color={c.text} />}
          onPress={onSamples}
        />
      </Card>
      {!canScan ? (
        <Txt v="caption" color="textMuted">
          Scanning works in the phone app. Here, choose a photo or use a sample.
        </Txt>
      ) : null}
    </ModalScreen>
  );
}
