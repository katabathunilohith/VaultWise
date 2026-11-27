import { CalendarDays, Gauge } from "lucide-react";
import { Card, CardTitle, Notice, cx } from "@/components/ui";
import { forecastPayout, type PayoutPlanInput, type PayoutScenario } from "@/lib/payout-planner";
import { fmtMoney } from "@/lib/shared";

export function showMoney(amount: number, currency: string) {
  return fmtMoney(amount, currency, { decimals: amount % 100 !== 0 });
}

export function showDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}

export function addDays(value: string, days: number) {
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function Scenario({ title, value, currency }: { title: string; value: PayoutScenario; currency: string }) {
  const short = value.shortfall > 0;
  return (
    <section className={cx("rounded-lg p-4", short ? "bg-warn-soft text-warn-ink" : "bg-accent-soft text-accent-ink")}>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs">Payout on {showDate(value.payoutDate)}</p>
      <p className="tnum mt-4 break-words text-2xl font-semibold tracking-tight">
        {showMoney(short ? value.shortfall : value.flexiblePerDay, currency)}
      </p>
      <p className="text-sm">{short ? "total cash gap" : "available per day"}</p>
      {value.firstShortfall && (
        <p className="mt-3 border-t border-current/20 pt-3 text-sm">
          Cash first runs short on <strong>{showDate(value.firstShortfall.date)}</strong> when covering {value.firstShortfall.cause}.
        </p>
      )}
    </section>
  );
}

export function Forecast({ input, currency }: { input: PayoutPlanInput | null; currency: string }) {
  const forecast = input && forecastPayout(input);
  return (
    <Card as="section" className="min-w-0 self-start">
      <CardTitle sub="What your opening cash can cover before the payout arrives.">
        <span className="inline-flex items-center gap-2">
          <Gauge aria-hidden className="size-4 text-accent" /> Payout forecast
        </span>
      </CardTitle>
      {forecast && input ? (
        <div className="space-y-4">
          <div className={cx("grid gap-3", input.delayDays > 0 && "sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2")}>
            <Scenario title="On time" value={forecast.onTime} currency={currency} />
            {input.delayDays > 0 && (
              <Scenario title={`${input.delayDays} ${input.delayDays === 1 ? "day" : "days"} late`} value={forecast.delayed} currency={currency} />
            )}
          </div>
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="pb-2 text-left font-semibold">How the cash adds up</caption>
            <thead>
              <tr className="border-b border-line text-ink-2">
                <th scope="col" className="py-2 font-medium">
                  Before payout
                </th>
                <th scope="col" className="text-right font-medium">
                  On time
                </th>
                {input.delayDays > 0 && (
                  <th scope="col" className="pl-2 text-right font-medium">
                    Delayed
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="tnum">
              {[
                ["Opening cash", input.openingCash, input.openingCash],
                ["Work costs", -forecast.onTime.workTotal, -forecast.delayed.workTotal],
                ["Bills", -forecast.onTime.billsTotal, -forecast.delayed.billsTotal],
                ["Cash left", forecast.onTime.balanceBeforePayout, forecast.delayed.balanceBeforePayout],
              ].map(([label, onTime, delayed]) => (
                <tr key={label} className="border-b border-line last:border-0 last:font-semibold">
                  <th scope="row" className="py-2 font-[inherit]">
                    {label}
                  </th>
                  <td className="text-right">{showMoney(Number(onTime) || 0, currency)}</td>
                  {input.delayDays > 0 && <td className="pl-2 text-right">{showMoney(Number(delayed) || 0, currency)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs leading-relaxed text-ink-2">
            Each day uses the work cost first, then bills in their listed order. The payout arrives at the start of payout day. Costs on that day fall
            after this forecast. Any spare cash is divided evenly across the days before payout.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-2 px-4 py-7 text-center">
          <CalendarDays className="mx-auto mb-2 size-6 text-accent-ink" aria-hidden />
          <p className="text-sm font-medium">Your comparison will appear here</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-2">Enter your cash, payout and work costs to see which days your money covers.</p>
        </div>
      )}
    </Card>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert">
      <Notice tone="bad">{message}</Notice>
    </div>
  );
}
