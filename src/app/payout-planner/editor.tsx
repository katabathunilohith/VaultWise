"use client";

import { useRef, useState, type FormEvent } from "react";
import { CalendarClock, FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, Field, Input, MoneyInput, Notice } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { payoutDateSchema, payoutPlanSchema, type PayoutHistory, type PayoutPlansResponse, type SavedPayoutPlan } from "@/lib/payout-planner";
import { addDays, Forecast, FormError } from "./forecast";

const maxAmount = 10_000_000;

export function AmountField({
  label,
  currency,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
}) {
  return (
    <Field label={label}>
      <MoneyInput
        currency={currency}
        type="number"
        required
        min={min}
        max={maxAmount}
        step="0.01"
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function minorUnits(amount: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount) && !/^\.\d{1,2}$/.test(amount)) return NaN;
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

type DraftBill = { key: string; name: string; dueDate: string; amount: string };

function freshDraft(today: string) {
  return {
    asOfDate: today,
    expectedPayoutDate: "",
    expectedPayoutAmount: "",
    openingCash: "",
    dailyWorkCost: "",
    delayDays: "2",
    bills: [] as DraftBill[],
  };
}

function exampleDraft(today: string) {
  const start = addDays(today, -8);
  return {
    asOfDate: start,
    expectedPayoutDate: addDays(start, 5),
    expectedPayoutAmount: "4000",
    openingCash: "2000",
    dailyWorkCost: "100",
    delayDays: "2",
    bills: [
      { key: "rent", name: "Hostel mess fee", dueDate: addDays(start, 2), amount: "1000" },
      { key: "repair", name: "Phone repair", dueDate: addDays(start, 5), amount: "500" },
    ],
  };
}

interface EditorProps {
  today: string;
  currency: string;
  history?: PayoutHistory;
  cacheScope: string;
  onSaved: (plan: SavedPayoutPlan) => void;
}

export function Editor({ today, currency, history, cacheScope, onSaved }: EditorProps) {
  const [draft, setDraft] = useState(() => freshDraft(today));
  const [isExample, setIsExample] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ payload: string; id: string } | null>(null);
  const past = draft.asOfDate < today && payoutDateSchema.safeParse(draft.asOfDate).success;
  const { data: earlier } = useApi<PayoutPlansResponse>(
    past && !isExample ? `/api/v1/payout-plans?asOfDate=${draft.asOfDate}${cacheScope}` : null,
  );
  const observed = past ? earlier?.history : history;
  const delayToTest = Math.min(observed?.maxLateDays ?? 0, 14);
  const alreadyTesting = Number(draft.delayDays) === delayToTest;

  const converted = payoutPlanSchema.safeParse({
    ...draft,
    expectedPayoutAmount: minorUnits(draft.expectedPayoutAmount),
    openingCash: minorUnits(draft.openingCash),
    dailyWorkCost: minorUnits(draft.dailyWorkCost),
    delayDays: draft.delayDays.trim() ? Number(draft.delayDays) : NaN,
    bills: draft.bills.map(({ name, dueDate, amount }) => ({ name, dueDate, amount: minorUnits(amount) })),
  });

  function change(patch: Partial<typeof draft>) {
    setTouched(true);
    setError("");
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  function editBill(key: string, patch: Partial<DraftBill>) {
    change({ bills: draft.bills.map((bill) => (bill.key === key ? { ...bill, ...patch } : bill)) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!converted.success) {
      setError(converted.error.issues[0].message);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const payload = JSON.stringify({ input: converted.data, isExample });
      if (payload !== pending.current?.payload) pending.current = { payload, id: crypto.randomUUID() };
      const { plan } = await api.post<{ plan: SavedPayoutPlan }>("/api/v1/payout-plans", {
        id: pending.current.id,
        input: converted.data,
        isExample,
      });
      onSaved(plan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {!touched && !isExample && (
          <Button
            type="button"
            variant="secondary"
            icon={<FlaskConical className="size-4" aria-hidden />}
            onClick={() => {
              setDraft(exampleDraft(today));
              setIsExample(true);
              setError("");
            }}
          >
            Try an example
          </Button>
        )}
        {isExample && (
          <Notice
            title="Fictional student example"
            action={
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft(freshDraft(today));
                  setIsExample(false);
                  setTouched(false);
                  setError("");
                }}
              >
                Start fresh
              </Button>
            }
          >
            You can change these figures. Saving keeps the example label.
          </Notice>
        )}
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card as="section">
              <CardTitle sub={`Use ${currency} for all amounts. Include only cash you can already spend.`}>Until your money comes in</CardTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plan starts">
                  <Input required type="date" value={draft.asOfDate} onChange={(event) => change({ asOfDate: event.target.value })} />
                </Field>
                <AmountField label="Cash on hand" currency={currency} value={draft.openingCash} onChange={(openingCash) => change({ openingCash })} />
                <Field label="When your next money arrives">
                  <Input
                    required
                    type="date"
                    value={draft.expectedPayoutDate}
                    min={addDays(draft.asOfDate, 1)}
                    max={addDays(draft.asOfDate, 90)}
                    onChange={(event) => change({ expectedPayoutDate: event.target.value })}
                  />
                </Field>
                <AmountField
                  label="How much arrives"
                  min={0.01}
                  currency={currency}
                  value={draft.expectedPayoutAmount}
                  onChange={(expectedPayoutAmount) => change({ expectedPayoutAmount })}
                />
                <AmountField
                  label="Daily costs"
                  currency={currency}
                  value={draft.dailyWorkCost}
                  onChange={(dailyWorkCost) => change({ dailyWorkCost })}
                />
                <Field label="Test a delay (days)">
                  <Input
                    required
                    type="number"
                    min="0"
                    max="14"
                    step="1"
                    value={draft.delayDays}
                    onChange={(event) => change({ delayDays: event.target.value })}
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-ink-2">
                Daily costs are travel, food and anything else you spend on most days. Use an average per calendar day.
              </p>
              {!isExample && observed && observed.sampleCount > 0 && (
                <div className="mt-4 space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">Your past payouts</p>
                  <p className="text-ink-2">
                    Based on your {observed.sampleCount === 1 ? "last checked-in payday" : `last ${observed.sampleCount} checked-in paydays`}.{" "}
                    {observed.lateCount ? (
                      <>The longest delay was {observed.maxLateDays} {observed.maxLateDays === 1 ? "day" : "days"}.</>
                    ) : "Each arrived by the date you expected."}
                    {observed.maxLateDays > 14 && " This planner can test up to 14 days."}
                  </p>
                  {delayToTest > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={alreadyTesting}
                      onClick={() => change({ delayDays: String(delayToTest) })}
                    >
                      {alreadyTesting ? "Testing" : "Test"} a {delayToTest}-day delay
                    </Button>
                  )}
                </div>
              )}
            </Card>
            <Card as="section">
              <CardTitle sub="Include bills due during a delay, even if they fall on the original payday.">Bills due</CardTitle>
              {draft.bills.map((bill, index) => (
                <fieldset key={bill.key} className="mb-4 min-w-0 rounded-lg border border-line p-3">
                  <legend className="px-1 text-xs font-medium text-ink-2">Bill {index + 1}</legend>
                  <div className="mb-3 flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Field label="Bill name">
                        <Input
                          required
                          maxLength={60}
                          value={bill.name}
                          placeholder="e.g. Hostel fee"
                          onChange={(event) => editBill(bill.key, { name: event.target.value })}
                        />
                      </Field>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove bill ${index + 1}`}
                      onClick={() => change({ bills: draft.bills.filter((other) => other.key !== bill.key) })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <Field label="Due date">
                      <Input
                        required
                        type="date"
                        min={draft.asOfDate}
                        max={addDays(draft.asOfDate, 104)}
                        value={bill.dueDate}
                        onChange={(event) => editBill(bill.key, { dueDate: event.target.value })}
                      />
                    </Field>
                    <AmountField
                      label="Bill amount"
                      min={0.01}
                      currency={currency}
                      value={bill.amount}
                      onChange={(amount) => editBill(bill.key, { amount })}
                    />
                  </div>
                </fieldset>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Plus className="size-4" aria-hidden />}
                disabled={draft.bills.length >= 24}
                onClick={() => change({ bills: [...draft.bills, { key: crypto.randomUUID(), name: "", dueDate: "", amount: "" }] })}
              >
                Add a bill
              </Button>
            </Card>
          </div>
          <Forecast input={converted.success ? converted.data : null} currency={currency} />
        </div>
        {error && <FormError message={error} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} icon={<Save className="size-4" aria-hidden />}>
            {isExample ? "Save example plan" : "Save plan"}
          </Button>
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <CalendarClock className="size-4 shrink-0" aria-hidden /> Record the actual amount when your money arrives.
          </p>
        </div>
      </fieldset>
    </form>
  );
}
