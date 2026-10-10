import { View } from "react-native";
import { ReceiptIcon } from "@/components/icons";
import { Row, Txt } from "@/components/ui";
import type { ProofView } from "@/lib/api/types";
import { money } from "@/lib/money";
import { documentDate } from "../format";
import { PAPER_INK, PAPER_MUTED, PaperCard, PaperRow, PaperRule } from "./Paper";

/**
 * What we read from the document, on paper: issuer, date, total, who it's for, and the
 * reference (the proof id). Extra rows (paid amount, vault) go above the reference.
 */
export function DocumentCard({
  proof,
  currency,
  title = "Your bill",
  fallbackIssuer,
  extra = [],
}: {
  proof: ProofView;
  currency: string;
  title?: string;
  fallbackIssuer?: string | null;
  extra?: { label: string; value: string; mono?: "m" | "s" }[];
}) {
  const x = proof.extracted;
  const issuer = x?.issuer ?? fallbackIssuer ?? null;
  const date = documentDate(x?.document_date ?? null);
  const total = typeof x?.total_amount === "number" ? money(Math.round(x.total_amount * 100), x.currency ?? currency) : null;
  const rows = [
    issuer ? { label: "Issued by", value: issuer } : null,
    date ? { label: "Dated", value: date } : null,
    total ? { label: "Total", value: total, mono: "m" as const } : null,
    x?.recipient_name ? { label: "For", value: x.recipient_name } : null,
  ].filter((r): r is { label: string; value: string; mono?: "m" } => !!r);
  return (
    <PaperCard>
      <Row gap={10}>
        <ReceiptIcon size={22} color={PAPER_INK} />
        <Txt v="titleM" color={PAPER_INK} style={{ flex: 1 }}>
          {title}
        </Txt>
      </Row>
      {rows.length ? (
        rows.map((r) => <PaperRow key={r.label} {...r} />)
      ) : (
        <Txt v="bodyM" color={PAPER_MUTED}>
          The details appear here once the bill has been read.
        </Txt>
      )}
      <View style={{ gap: 8 }}>
        <PaperRule />
        {extra.map((r) => (
          <PaperRow key={r.label} {...r} />
        ))}
        <PaperRow label="Reference" value={proof.id} mono="s" />
      </View>
    </PaperCard>
  );
}
