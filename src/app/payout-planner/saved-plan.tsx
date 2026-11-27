"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Check } from "lucide-react";
import { Badge, Button, Card, CardTitle, Field, Input, KV, Notice } from "@/components/ui";
import { api } from "@/lib/client";
import type { SavedPayoutPlan } from "@/lib/payout-planner";
import { AmountField, minorUnits } from "./editor";
import { Forecast, FormError, showDate, showMoney } from "./forecast";

function dayDifference(days: number) {
  if (days === 0) return "On time";
  const count = Math.abs(days);
  return `${count} ${count === 1 ? "day" : "days"} ${days < 0 ? "early" : "late"}`;
}

function CheckIn({ plan, today, onSaved }: { plan: SavedPayoutPlan; today: string; onSaved: (plan: SavedPayoutPlan) => void }) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actual = plan.actual;
  const fmt = (value: number) => showMoney(value, plan.currency);

  async function record(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const minor = minorUnits(amount);
    if (!Number.isSafeInteger(minor)) {
      setError("Enter the amount received with up to two decimal places.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.patch<{ plan: SavedPayoutPlan }>("/api/v1/payout-plans", { id: plan.id, actualDate: date, actualAmount: minor });
      onSaved(result.plan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section">
      <CardTitle sub={`Expected ${fmt(plan.input.expectedPayoutAmount)} on ${showDate(plan.input.expectedPayoutDate)}.`}>
        <span className="inline-flex items-center gap-2">
          <Banknote className="size-4 text-accent" aria-hidden /> Payout check-in
        </span>
      </CardTitle>
      {actual ? (
        <Notice tone="good" title={`Received ${fmt(actual.amount)} on ${showDate(actual.date)}`}>
          {dayDifference(actual.daysDifference)}.{" "}
          {actual.amountDifference === 0
            ? "The amount matched your estimate."
            : `${fmt(Math.abs(actual.amountDifference))} ${actual.amountDifference < 0 ? "below" : "above"} your estimate.`}
        </Notice>
      ) : today < plan.input.asOfDate ? (
        <p className="text-sm text-ink-2">You can record a payout from {showDate(plan.input.asOfDate)}.</p>
      ) : (
        <form onSubmit={record}>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date received">
                <Input required type="date" value={date} min={plan.input.asOfDate} max={today} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <AmountField label="Actual amount received" value={amount} onChange={setAmount} currency={plan.currency} />
            </div>
            <p className="text-xs text-ink-2">Record the final amount credited. You can check in once per plan.</p>
            {error && <FormError message={error} />}
            <Button loading={busy} type="submit" icon={<Check className="size-4" aria-hidden />}>
              Record payout
            </Button>
          </fieldset>
        </form>
      )}
    </Card>
  );
}

export function SavedPlan({ plan, today, onSaved }: { plan: SavedPayoutPlan; today: string; onSaved: (plan: SavedPayoutPlan) => void }) {
  const p = plan.input;
  const fmt = (value: number) => showMoney(value, plan.currency);
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Card as="section">
          <CardTitle
            sub={`${showDate(p.asOfDate)} to ${showDate(p.expectedPayoutDate)}`}
            action={plan.isExample && <Badge tone="info">Fictional example</Badge>}
          >
            Saved payout week
          </CardTitle>
          <div className="divide-y divide-line">
            <KV k="Opening cash" v={fmt(p.openingCash)} />
            <KV k="Daily work cost" v={fmt(p.dailyWorkCost)} />
            <KV k="Delay tested" v={dayDifference(p.delayDays)} />
          </div>
          {p.bills.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Bills due</h3>
              <ul className="mt-1 divide-y divide-line">
                {p.bills.map((bill, index) => (
                  <li key={index} className="flex justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="break-words">{bill.name}</span>
                      <div className="text-xs text-ink-2">{showDate(bill.dueDate)}</div>
                    </div>
                    <span className="tnum">{fmt(bill.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-2">No dated bills in this plan.</p>
          )}
        </Card>
        <CheckIn plan={plan} today={today} onSaved={onSaved} />
      </div>
      <Forecast input={p} currency={plan.currency} />
    </div>
  );
}
