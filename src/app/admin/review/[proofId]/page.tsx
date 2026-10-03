"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, CircleX } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { CATEGORIES, fmtDate, fmtMoney, timeAgo } from "@/lib/shared";
import { DecisionBanner, PipelineStages, ProofImages, type ProofView } from "@/components/verification";
import { Badge, Button, Card, CardTitle, ErrorNote, Field, KV, PageHeader, Skeleton, Textarea, useToast } from "@/components/ui";

interface ReviewData extends ProofView {
  user: { id: string; name: string; jurisdiction: string; currency: string; created_at: number; kyc_status: string };
  history: { decision: string; final_decision: string | null; n: number }[];
  flags: { id: string; severity: string; description: string; status: string; created_at: number }[];
}

export default function ReviewPage() {
  const { proofId } = useParams<{ proofId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<ReviewData>(`/api/v1/admin/reviews/${proofId}`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!data)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  const v = data.verification;
  const pending = (v.decision === "human_review" && !v.finalDecision) || v.finalDecision === "appealed";
  const x = data.extracted as null | {
    issuer?: string;
    recipient_name?: string;
    document_date?: string;
    total_amount?: number;
    document_type?: string;
    reference_number?: string;
  };

  const decide = async (decision: "approved" | "denied") => {
    setBusy(decision);
    setErr(null);
    try {
      await api.post(`/api/v1/admin/reviews/${proofId}`, { decision, note });
      toast({ tone: "good", text: decision === "approved" ? "Approved — funds released." : "Declined — customer notified." });
      refreshAll();
      router.push("/admin");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vw-in">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Operations console
      </Link>
      <PageHeader
        eyebrow={v.finalDecision === "appealed" ? "Appeal review" : "Manual review"}
        title={data.withdrawal ? `${fmtMoney(data.withdrawal.amount, data.user.currency)} to ${data.withdrawal.payee}` : "Emergency receipt"}
        subtitle={`${data.user.name} · ${data.vault?.name ?? "Emergency"} · ${CATEGORIES[data.category]?.label ?? data.category} template · uploaded ${timeAgo(data.createdAt)}`}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <Card>
            <ProofImages proofId={data.id} hasEla={data.hasEla} />
          </Card>
          <Card>
            <CardTitle>Customer</CardTitle>
            <div className="divide-y divide-line text-[13px]">
              <KV k="Name" v={data.user.name} />
              <KV k="Market" v={data.user.jurisdiction} />
              <KV k="KYC" v={<Badge tone="good">{data.user.kyc_status}</Badge>} />
              <KV k="Customer since" v={fmtDate(data.user.created_at)} />
              <KV
                k="Verification history"
                v={
                  <span className="text-xs">
                    {data.history.map((h) => `${h.n} ${h.final_decision ?? h.decision}`.replace(/_/g, " ")).join(" · ")}
                  </span>
                }
              />
            </div>
            {data.flags.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {data.flags.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 text-xs">
                    <Badge tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "neutral"}>{f.severity}</Badge>
                    <span className="text-ink-2">{f.description}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <DecisionBanner v={data} currency={data.user.currency} />
          {v.appealNote && (
            <Card>
              <div className="text-[13px] text-muted">Customer&apos;s appeal</div>
              <p className="mt-1 text-sm">“{v.appealNote}”</p>
            </Card>
          )}
          {x && (
            <Card>
              <CardTitle>Extracted fields</CardTitle>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <KV k="Type" v={(x.document_type ?? "—").replace(/_/g, " ")} />
                <KV k="Issuer" v={x.issuer ?? "—"} />
                <KV k="Billed to" v={x.recipient_name ?? "—"} />
                <KV k="Date" v={x.document_date ?? "—"} />
                <KV k="Reference" v={x.reference_number ?? "—"} />
                <KV k="Total" v={x.total_amount != null ? x.total_amount.toFixed(2) : "—"} />
              </div>
            </Card>
          )}
          <Card>
            <CardTitle sub={v.modelVersion ?? undefined}>Pipeline evidence</CardTitle>
            <PipelineStages stages={v.stages} />
          </Card>
          {pending ? (
            <Card className="border-accent/40">
              <CardTitle sub="Your decision and note are written to the immutable audit log and used as a training label.">Decision</CardTitle>
              <Field label="Reviewer note">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Rent receipt covers first month only; deposit portion needs the lease agreement."
                />
              </Field>
              {err && (
                <div className="mt-3">
                  <ErrorNote>{err}</ErrorNote>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  icon={<CircleCheck className="size-4" />}
                  disabled={note.trim().length < 3}
                  loading={busy === "approved"}
                  onClick={() => decide("approved")}
                >
                  Approve &amp; release
                </Button>
                <Button
                  variant="danger"
                  icon={<CircleX className="size-4" />}
                  disabled={note.trim().length < 3}
                  loading={busy === "denied"}
                  onClick={() => decide("denied")}
                >
                  Decline
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="text-sm text-ink-2">This case is closed{v.reviewer ? ` — decided by ${v.reviewer}` : ""}.</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
