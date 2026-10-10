import { ClockIcon, MagnifyingGlassIcon, XCircleIcon } from "@/components/icons";
import { Button, ModalScreen, PracticeBadge, Stack, Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";
import type { CheckoutFlow } from "./useCheckoutFlow";

export type GoneReason = "notfound" | "expired" | "cancelled";

/** Expired, cancelled or unknown checkouts: what happened, that nothing was paid, what to do next. */
export function Unavailable({ reason, merchant, flow }: { reason: GoneReason; merchant?: string; flow: CheckoutFlow }) {
  const { c } = useTheme();
  const copy = {
    notfound: {
      Icon: MagnifyingGlassIcon,
      title: "We can't find this payment",
      body: "The code may be mistyped or no longer valid. Check it with the merchant and scan again.",
    },
    expired: {
      Icon: ClockIcon,
      title: "This payment request expired",
      body: `Nothing was paid. Ask ${merchant ?? "the merchant"} for a new code.`,
    },
    cancelled: {
      Icon: XCircleIcon,
      title: "The merchant cancelled this",
      body: "Nothing was paid. If you still owe them, ask for a new code.",
    },
  }[reason];
  return (
    <ModalScreen
      title="Checkout"
      onClose={flow.close}
      footer={
        <>
          <Button label="Talk to a person" variant="tonal" size="md" onPress={flow.talkToPerson} />
          <Button label="Close" armOnMount onPress={flow.close} />
        </>
      }
    >
      <Stack gap={space.xs}>
        <copy.Icon size={36} color={c.textMuted} />
        <Txt v="headline" accessibilityRole="header">
          {copy.title}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {copy.body}
        </Txt>
        <PracticeBadge />
      </Stack>
    </ModalScreen>
  );
}
