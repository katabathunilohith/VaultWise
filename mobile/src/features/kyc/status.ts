import type { Tone } from "@/components/ui";
import { docLabel, maskId } from "@/lib/api/identity-ids";
import type { KycStatus } from "@/lib/api/identity-types";

/** An ID check in plain words: the headline, what it means for money, and a status pill. */
export interface KycCopy {
  /** Nothing has been sent yet. */
  notStarted: boolean;
  title: string;
  body: string;
  pill: { tone: Tone; label: string };
}

/** "pending" with no document means nothing was sent: new accounts start that way. */
export function describeKyc(k: { status: KycStatus | string; docType?: string | null }): KycCopy {
  const sent = !!k.docType;
  switch (k.status) {
    case "verified":
      return { notStarted: false, title: "Your ID is verified", body: "Money can move. Nothing more to do.", pill: { tone: "success", label: "Verified" } };
    case "needs_review":
      return {
        notStarted: false,
        title: "A person is checking your ID",
        body: "Usually within a day. You can use Vaultwise meanwhile. Money can move once they're done.",
        pill: { tone: "info", label: "Being checked" },
      };
    case "rejected":
      return {
        notStarted: false,
        title: "Your ID wasn't accepted",
        body: "See why, then try again with a clearer photo or another ID.",
        pill: { tone: "danger", label: "Not accepted" },
      };
    case "pending":
      if (sent)
        return {
          notStarted: false,
          title: "Your ID is being checked",
          body: "Money can move once it's done.",
          pill: { tone: "info", label: "Being checked" },
        };
      break;
  }
  return {
    notStarted: true,
    title: "Verify your ID to move money",
    body: "It takes about a minute. Have your ID card or passport with you.",
    pill: { tone: "neutral", label: "Not verified" },
  };
}

/** "Passport ••••4821", or just the ID type when no number was read. */
export function idLine(docType: string | null | undefined, idLast4: string | null | undefined) {
  const masked = maskId(docType, idLast4);
  return masked ? `${docLabel(docType)} ${masked}` : docLabel(docType);
}
