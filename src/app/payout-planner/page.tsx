"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button, Field, Notice, PageHeader, Select, Skeleton } from "@/components/ui";
import { useMe } from "@/components/shell";
import { useApi } from "@/lib/client";
import type { PayoutPlansResponse, SavedPayoutPlan } from "@/lib/payout-planner";
import { timeZoneFor } from "@/lib/timezones";
import { Editor } from "./editor";
import { showDate, showMoney } from "./forecast";
import { SavedPlan } from "./saved-plan";

const endpoint = "/api/v1/payout-plans";

function Planner({ currency, timeZone, accountId }: { currency: string; timeZone: string; accountId: string }) {
  // useApi keys its cache by URL. The fragment scopes entries to this account;
  // the browser omits it from the HTTP request, whose owner comes from the session.
  const cacheScope = "#" + encodeURIComponent(accountId);
  const { data, reload, error } = useApi<PayoutPlansResponse>(endpoint + cacheScope);
  const [today] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date()));
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [justSaved, setJustSaved] = useState<SavedPayoutPlan | null>(null);
  const [message, setMessage] = useState("");
  const plans = data?.plans ?? [];
  const remote = justSaved && plans.find((plan) => plan.id === justSaved.id);
  // A confirmed write may lead the cached list. A later check-in from another tab wins.
  const needsOverlay = justSaved && (!remote || (justSaved.actual && !remote.actual));
  const history = needsOverlay ? [justSaved, ...plans.filter((plan) => plan.id !== justSaved.id)] : plans;
  const selected = history.find((plan) => plan.id === selectedId) ?? history[0];
  const showEditor = editing || !selected;

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  function saved(plan: SavedPayoutPlan) {
    setJustSaved(plan);
    setSelectedId(plan.id);
    setEditing(false);
    setMessage(plan.actual ? "Payout recorded." : "Plan saved.");
    void reload();
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="vw-in">
      <PageHeader
        title="Payout planner"
        subtitle="Will your cash cover fuel and bills if your delivery payout arrives late?"
        actions={
          selected && (
            <Button
              variant="secondary"
              icon={showEditor ? <ArrowLeft className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              onClick={() => {
                setMessage("");
                setEditing(!showEditor);
              }}
            >
              {showEditor ? "Back to saved plans" : "New plan"}
            </Button>
          )
        }
      />
      {message && (
        <div role="status" className="mb-4">
          <Notice tone="good">{message}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-4" role="alert">
          <Notice
            tone="bad"
            title="Couldn’t load saved plans"
            action={
              <Button size="sm" variant="secondary" onClick={() => void reload()}>
                Retry
              </Button>
            }
          >
            {error}
          </Notice>
        </div>
      )}
      {!data && !error && !justSaved ? (
        <div aria-label="Loading plans" role="status">
          <Skeleton className="h-52 w-full" />
        </div>
      ) : showEditor ? (
        <Editor currency={currency} today={today} history={data?.history} cacheScope={cacheScope} onSaved={saved} />
      ) : (
        <div className="space-y-4">
          {history.length > 1 && (
            <div className="max-w-md">
              <Field label="Saved plan" hint="Showing your most recent plans.">
                <Select
                  value={selected.id}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setMessage("");
                  }}
                >
                  {history.map((plan, index) => (
                    <option key={plan.id} value={plan.id}>
                      {index + 1}. {showDate(plan.input.expectedPayoutDate)} · {showMoney(plan.input.expectedPayoutAmount, plan.currency)}
                      {plan.isExample ? " · Example" : ""}
                      {plan.actual ? " · Checked in" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <SavedPlan key={selected.id} plan={selected} today={today} onSaved={saved} />
        </div>
      )}
    </div>
  );
}

export default function PayoutPlannerPage() {
  const { user } = useMe();
  const timeZone = timeZoneFor({ country: user.country?.code, jurisdiction: user.jurisdiction });
  return <Planner key={user.id} accountId={user.id} currency={user.currency} timeZone={timeZone} />;
}
