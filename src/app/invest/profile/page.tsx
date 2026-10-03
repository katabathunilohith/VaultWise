"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { InvestNav } from "@/components/invest-nav";
import { useMe } from "@/components/shell";
import { Button, Card, ErrorNote, PageHeader, Progress, Skeleton, cx } from "@/components/ui";

interface ProfileData {
  questions: { id: string; text: string; options: { label: string; points: number }[] }[];
  bands: { band: number; name: string; expReturn: number; vol: number }[];
  profile: { score: number; band: number; bandName: string; answers: Record<string, number>; completedAt: number } | null;
  portfolio: { slot: string; label: string; symbol: string; name: string; weight: number }[] | null;
}

function Allocation({ portfolio }: { portfolio: NonNullable<ProfileData["portfolio"]> }) {
  const colors = ["#2a78d6", "#1baf7a", "#eb6834", "#eda100", "#e87ba4"];
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {portfolio.map((a, i) => (
          <div key={a.symbol} style={{ width: `${a.weight * 100}%`, background: colors[i] }} title={`${a.label} ${Math.round(a.weight * 100)}%`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {portfolio.map((a, i) => (
          <li key={a.symbol} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 rounded-[3px]" style={{ background: colors[i] }} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{a.label}</span>
              <span className="block truncate text-xs text-muted">
                {a.symbol} · {a.name}
              </span>
            </span>
            <span className="tnum font-semibold">{Math.round(a.weight * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProfilePage() {
  const { data } = useApi<ProfileData>("/api/v1/invest/profile");
  const { reload } = useMe();
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [retake, setRetake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );

  const showResult = data.profile && !retake;
  const q = data.questions[step];

  const submit = async (final: Record<string, number>) => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/v1/invest/profile", { answers: final });
      setRetake(false);
      refreshAll();
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vw-in">
      <PageHeader
        title="Risk profile"
        subtitle="Your answers set the Core model portfolio and decide whether the Satellite sleeve is suitable for you."
      />
      <InvestNav />
      {showResult && data.profile && data.portfolio ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <div className="text-[13px] text-muted">Your band</div>
            <div className="mt-1 text-3xl font-semibold">{data.profile.bandName}</div>
            <div className="mt-1 text-sm text-ink-2">Score {data.profile.score}/100</div>
            <div className="mt-5 flex gap-1.5">
              {data.bands.map((b) => (
                <div key={b.band} className="flex-1">
                  <div className={cx("h-2 rounded-full", b.band <= data.profile!.band ? "bg-accent" : "bg-sunken")} />
                  <div className={cx("mt-1.5 text-[11px] leading-tight", b.band === data.profile!.band ? "font-semibold text-ink" : "text-muted")}>
                    {b.name}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[13px] text-ink-2">
              Long-run assumptions for this band: about {(data.bands[data.profile.band - 1].expReturn * 100).toFixed(1)}% a year with{" "}
              {(data.bands[data.profile.band - 1].vol * 100).toFixed(0)}% volatility. These are planning assumptions, not promises.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="brand" onClick={() => router.push("/invest/core")}>
                See Core portfolio
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRetake(true);
                  setStep(0);
                  setAnswers({});
                }}
              >
                Retake
              </Button>
            </div>
          </Card>
          <Card>
            <div className="mb-4 text-[15px] font-semibold">Model portfolio</div>
            <Allocation portfolio={data.portfolio} />
          </Card>
        </div>
      ) : (
        <Card className="mx-auto max-w-2xl">
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>
                Question {step + 1} of {data.questions.length}
              </span>
              {step > 0 && (
                <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="size-3" /> Back
                </button>
              )}
            </div>
            <Progress value={step / data.questions.length} height={4} label="Questionnaire progress" />
          </div>
          <h2 className="text-xl font-semibold">{q.text}</h2>
          <div className="mt-5 space-y-2">
            {q.options.map((o, i) => (
              <button
                key={o.label}
                disabled={busy}
                onClick={() => {
                  const next = { ...answers, [q.id]: i };
                  setAnswers(next);
                  if (step < data.questions.length - 1) setStep(step + 1);
                  else submit(next);
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-colors",
                  answers[q.id] === i ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong hover:bg-surface-2",
                )}
              >
                {o.label}
                {answers[q.id] === i && <CircleCheck className="size-4 text-accent" />}
              </button>
            ))}
          </div>
          {err && (
            <div className="mt-4">
              <ErrorNote>{err}</ErrorNote>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
