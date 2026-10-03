"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CATEGORIES, fmtDate, fmtMoney } from "@/lib/shared";
import { useMe } from "@/components/shell";
import { AppealForm, DecisionBanner, PipelineStages, ProofImages, useProof } from "@/components/verification";
import { Card, CardTitle, KV, PageHeader, Skeleton } from "@/components/ui";

export default function ProofPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useMe();
  const proof = useProof(id);
  if (!proof)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  const v = proof.verification;
  const x = proof.extracted as null | {
    document_type?: string;
    issuer?: string;
    recipient_name?: string;
    document_date?: string;
    total_amount?: number;
    currency?: string;
    reference_number?: string;
    summary?: string;
    line_items?: { description: string; amount: number | null }[];
  };
  return (
    <div className="vw-in">
      <Link
        href={proof.vault ? `/vaults/${proof.vault.id}` : "/emergency"}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {proof.vault ? proof.vault.name : "Emergency access"}
      </Link>
      <PageHeader
        eyebrow="Proof-of-purpose verification"
        title={proof.withdrawal ? `${fmtMoney(proof.withdrawal.amount, user.currency)} to ${proof.withdrawal.payee}` : "Emergency receipt"}
        subtitle={`Uploaded ${fmtDate(proof.createdAt, true)} · verified against the ${CATEGORIES[proof.category]?.label ?? proof.category} template`}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <DecisionBanner v={proof} currency={user.currency} />
          {v.finalDecision === "denied" && <AppealForm proofId={proof.id} />}
          {v.appealNote && (
            <Card>
              <div className="text-[13px] text-muted">Your appeal</div>
              <p className="mt-1 text-sm">“{v.appealNote}”</p>
            </Card>
          )}
          <Card>
            <CardTitle sub="Each stage is logged with its result, timing and the model version that produced it">Pipeline</CardTitle>
            <PipelineStages stages={v.stages} />
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <ProofImages proofId={proof.id} hasEla={proof.hasEla} />
          </Card>
          {x && (
            <Card>
              <CardTitle sub={x.summary}>What the model read</CardTitle>
              <div className="divide-y divide-line">
                <KV k="Document type" v={(x.document_type ?? "—").replace(/_/g, " ")} />
                <KV k="Issuer" v={x.issuer ?? "—"} />
                <KV k="Billed to" v={x.recipient_name ?? "—"} />
                <KV k="Date" v={x.document_date ?? "—"} />
                <KV k="Reference" v={x.reference_number ?? "—"} />
                <KV
                  k="Total"
                  v={
                    x.total_amount != null ? (
                      <span className="tnum">
                        {x.total_amount.toFixed(2)} {x.currency ?? ""}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
              {x.line_items && x.line_items.length > 0 && (
                <div className="mt-3 rounded-lg bg-sunken p-3">
                  {x.line_items.map((l, i) => (
                    <div key={i} className="flex justify-between gap-3 py-0.5 text-[13px]">
                      <span className="text-ink-2">{l.description}</span>
                      <span className="tnum">{l.amount != null ? l.amount.toFixed(2) : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          <Card>
            <CardTitle>Audit details</CardTitle>
            <div className="divide-y divide-line text-[13px]">
              <KV k="Proof ID" v={<code className="font-mono text-xs">{proof.id}</code>} />
              <KV k="Model" v={<span className="text-xs">{v.modelVersion}</span>} />
              <KV k="Decision" v={v.decision?.replace(/_/g, " ") ?? "pending"} />
              {v.reviewer && <KV k="Reviewer" v={v.reviewer} />}
              {v.durationMs != null && <KV k="Pipeline time" v={`${(v.durationMs / 1000).toFixed(1)} s`} />}
              {v.decidedAt && <KV k="Decided" v={fmtDate(v.decidedAt, true)} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
