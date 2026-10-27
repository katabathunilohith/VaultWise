import { router } from "expo-router";
import type { Icon } from "@/components/icons";
import { ListRow, StatusPill, type Tone } from "@/components/ui";
import { useMe } from "@/lib/api/hooks";
import { spokenId } from "@/lib/api/identity-ids";
import type { MeKyc } from "@/lib/api/identity-types";
import type { Me } from "@/lib/api/types";
import { usePracticeMode } from "@/lib/api/practice";
import { KYC_ENABLED } from "./config";
import { IdentificationCardIcon } from "./icons";
import { describeKyc, idLine } from "./status";
import { VERIFY_ID_HREF } from "./routes";

/** The account's ID check from /me: the identity summary, or the older `user.kycStatus`. */
export function kycOf(me: Me | undefined): MeKyc | null {
  if (!me?.onboarded) return null;
  return me.kyc ?? { status: me.user.kycStatus as MeKyc["status"] };
}

/** A to-do for Home, in the shape TodoCards draws (features/home/TodoCards.tsx). */
export interface IdentityTodo {
  icon: Icon;
  title: string;
  body: string;
  pill: { tone: Tone; label: string };
  onPress: () => void;
}

/**
 * Home's "Verify your ID to move money" (and its later states) while the live account isn't
 * verified. Nothing in Practice, where the sample person is verified.
 */
export function useIdentityTodo(): IdentityTodo | null {
  const me = useMe();
  const practice = usePracticeMode();
  const k = kycOf(me.data);
  if (!KYC_ENABLED || practice || !k || k.status === "verified") return null;
  const copy = describeKyc(k);
  return { icon: IdentificationCardIcon, title: copy.title, body: copy.body, pill: copy.pill, onPress: () => router.push(VERIFY_ID_HREF) };
}

/** Settings: the ID check's status, opening Verify your ID. */
export function IdentityRow() {
  const me = useMe();
  const k = kycOf(me.data);
  if (!KYC_ENABLED) return null;
  const copy = k ? describeKyc(k) : null;
  const showId = !!k && k.status === "verified" && !!k.docType;
  const subtitle = !k ? "Check who you are, so money can move" : showId ? idLine(k.docType, k.idLast4) : copy!.body;
  const said = showId ? spokenId(k!.docType, k!.idLast4) : subtitle;
  return (
    <ListRow
      icon={IdentificationCardIcon}
      title="Identity verification"
      subtitle={subtitle}
      trailing={copy ? <StatusPill tone={copy.pill.tone} label={copy.pill.label} /> : undefined}
      accessibilityLabel={`Identity verification. ${copy ? `${copy.pill.label}. ` : ""}${said}`}
      onPress={() => router.push(VERIFY_ID_HREF)}
    />
  );
}
