import { fetch as expoFetch } from "expo/fetch";
import { getSession } from "../auth/session-state"; // ai-consent
import { getConnection } from "./connection";
import { demo } from "./demo";
import { deviceHeaders, noteDeviceRevoked } from "./device"; // devices
import { ApiError } from "./errors";
import { authHeaders, formWith, post, request } from "./http";
import { identityLive } from "./identity";
import { observed } from "./observe"; // tester
import { noteSignedOut } from "./signed-out"; // identity, devices
import { securityLive } from "./security"; // devices, alerts, OTP
import { walletLive } from "./wallet";
import { payDryRun } from "./pay-sim";
import type { PaymentIntent } from "./pay-types";
import { isPracticeMode } from "./practice";
import type {
  Accounts,
  Activity,
  BadgesResponse,
  CreateVaultInput,
  Dashboard,
  EmergencyInput,
  EmergencyOverview,
  EmergencyPreview,
  EmergencyResult,
  Insight,
  InvestCore,
  LimitKey,
  LimitsOverview,
  Me,
  OnboardingInput,
  UpdateVaultInput,
  Portfolio,
  ProofView,
  Sample,
  UploadFile,
  Vault,
  VaultDetail,
} from "./types";

export { ApiError } from "./errors";
/** devices: Practice-only ways to try the new-phone rules (Your devices → Try it in Practice). */
export { practiceDeviceTools } from "./demo/devices";

const liveVaults = () => request<{ vaults: Vault[]; currency: string }>("/vaults");

/**
 * Pay with Vaultwise. While /pay/* isn't deployed (the server answers 404), the checkout is
 * simulated on the device as a dry run against the customer's own vaults (never the demo's sample
 * vaults): balances are checked, nothing is paid or held, and the intent is marked `dryRun` so the
 * screens say so.
 */
async function orPayDryRun<T>(call: () => Promise<T>, dryRun: (vaults: Vault[], walletCurrency: string) => T): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  // Fresh balances, so the dry run checks what the vaults really have available now.
  const { vaults, currency } = await liveVaults();
  return dryRun(vaults, currency);
}

const emergencyPreview = (amountMajor: number) => post<EmergencyPreview>("/emergency/preview", { amount: amountMajor });

const live = {
  ...walletLive, // wallet
  ...identityLive, // identity
  ...securityLive, // devices, alerts, OTP (plan 06)
  me: () => request<Me>("/me"),
  // Seeding demo history fetches market data on the server and can take up to about 2 minutes.
  onboarding: (input: OnboardingInput) =>
    request<{ ok: true }>("/onboarding", { method: "POST", body: JSON.stringify(input) }, { timeoutMs: 130_000 }),
  dashboard: () => request<Dashboard>("/dashboard"),
  vaults: liveVaults,
  vault: (id: string) => request<VaultDetail>(`/vaults/${id}`),
  createVault: (input: CreateVaultInput) => post<{ id: string }>("/vaults", input),
  updateVault: (id: string, patch: UpdateVaultInput) => request<{ ok: true }>(`/vaults/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deposit: (vaultId: string, amountMajor: number, memo?: string) => post<{ journalId: string }>(`/vaults/${vaultId}/deposits`, { amount: amountMajor, memo }),
  /** `pin`: the MPIN (features/mpin), on every money move out. */
  withdraw: (vaultId: string, amountMajor: number, payee: string, note?: string, pin?: string) =>
    post<{ id: string; status: string }>(`/vaults/${vaultId}/withdrawals`, { amount: amountMajor, payee, note, pin }),
  cancelWithdrawal: (id: string) => request<{ ok: true }>(`/withdrawals/${id}`, { method: "DELETE" }),
  uploadProof: async (vaultId: string, withdrawalId: string, file: UploadFile) =>
    request<{ id: string; status: string }>(`/vaults/${vaultId}/proofs`, { method: "POST", body: await formWith(file, { withdrawalId }) }),
  proof: (id: string) => request<ProofView>(`/proofs/${id}`),
  appeal: (id: string, note: string) => post<{ ok: true }>(`/proofs/${id}/appeal`, { note }),
  emergency: () => request<EmergencyOverview>("/emergency"),
  emergencyPreview,
  /**
   * A request a safety limit stops comes back as 422 with the plan explaining why; keep that body.
   * Without it, the plan is asked for again so the answer can still say why (a 422 if that fails too).
   */
  emergencyWithdraw: async (input: EmergencyInput): Promise<EmergencyResult> => {
    const r = await request<EmergencyResult | null>("/emergency/withdrawals", { method: "POST", body: JSON.stringify(input) }, { acceptStatus: [422] });
    if (r?.plan) return r;
    if (r && r.status !== "blocked") {
      // Accepted, but the reply left the plan out: fetch it to show, never calling the request blocked.
      const plan = await emergencyPreview(input.amount).catch(() => null);
      if (plan) return { ...r, plan };
      throw new ApiError("Your request went through, but its details didn't load. Open Emergency to see where it is.", 502);
    }
    const plan = await emergencyPreview(input.amount).catch(() => {
      throw new ApiError("A safety limit stops this request", 422);
    });
    return { id: r?.id ?? "", status: "blocked", plan };
  },
  emergencyReceipt: async (id: string, file: UploadFile) =>
    request<{ id: string; status: string }>(`/emergency/${id}/receipt`, { method: "POST", body: await formWith(file) }),
  limits: () => request<LimitsOverview>("/limits"),
  /** `pin`: the MPIN, needed when any limit goes up. */
  setLimits: (major: Partial<Record<LimitKey, number>>, pin?: string) =>
    request<{ overview: LimitsOverview }>("/limits", { method: "PUT", body: JSON.stringify(pin ? { ...major, pin } : major) }),
  portfolio: () => request<Portfolio>("/portfolio"),
  investCore: () => request<InvestCore>("/invest/core"),
  investSatellite: () => request<Record<string, unknown>>("/invest/satellite"),
  buyCore: (amountMajor: number, pin?: string) => post<{ fills: unknown[] }>("/invest/core/buy", { amount: amountMajor, pin }),
  /** `pin`: the MPIN (`invest_sip`), when the plan is new or moves more money (sipNeedsMpin in lib/invest.ts); left out when lowering. */
  setSip: (amountMajor: number, frequency: "weekly" | "monthly", pin?: string) =>
    post<{ ok: true }>("/invest/core/sip", { amount: amountMajor, frequency, pin }),
  /** Stopping a plan moves no money: no MPIN. */
  cancelSip: () => request<{ ok: true }>("/invest/core/sip", { method: "DELETE" }),
  /**
   * mpin: set money aside for the Satellite sleeve from the bank (opting in the first time). `acknowledged`:
   * how many risk disclosures were confirmed (all of them, or the server refuses); `pin`: the MPIN (`satellite_opt_in`).
   */
  satelliteOptIn: (amountMajor: number, acknowledged: number, pin?: string) =>
    post<{ ok: true }>("/invest/satellite/opt-in", { amount: amountMajor, acknowledged, pin }),
  /** mpin: change the MPIN; the server checks the current one and the policy (400 `mpin_weak` with `reason`). */
  changeMpin: (currentPin: string, newPin: string) => post<{ ok: true }>("/mpin", { currentPin, newPin }),
  region: () => request<{ guess: { country: string | null; supported: boolean; source: string | null; detail: string | null } }>("/region"),
  /**
   * Wipes the server wallet (Settings → Delete account), or closes the account with sign-in on, which needs the
   * MPIN in `pin`. The simulated checkouts start over with it.
   */
  reset: async (pin?: string) => {
    const res = await post<{ ok: true }>("/reset", pin ? { pin } : undefined);
    payDryRun.reset();
    return res;
  },
  /** Full data export (JSON), opened in the browser. Null where there's nothing to export (Practice). */
  exportUrl: (): string | null => `${getConnection().baseUrl}/api/v1/me/export`,
  insight: () => request<Insight>("/insight"),
  activity: () => request<Activity>("/activity"),
  accounts: () => request<Accounts>("/accounts"),
  simulate: (type: "salary" | "spend") => post<{ ok: true }>("/accounts/simulate", { type }),
  sweep: () => post<{ ok: true }>("/accounts/sweep"),
  badges: () => request<BadgesResponse>("/badges"),
  samples: () => request<{ samples: Sample[] }>("/samples"),
  sampleUri: (key: string) => `${getConnection().baseUrl}/api/v1/samples/${key}`,

  /** Streams the assistant's reply; calls onDelta with each chunk of text. */
  assistant: async (
    messages: { role: "user" | "assistant"; content: string }[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ) => {
    let res: Awaited<ReturnType<typeof expoFetch>>;
    const sentAt = Date.now();
    try {
      res = await expoFetch(`${getConnection().baseUrl}/api/v1/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders(getConnection().baseUrl)), ...(await deviceHeaders()), "x-ai-consent": getSession().aiConsent ? "yes" : "no" }, // identity, devices, ai-consent: the assistant's own consent
        body: JSON.stringify({ messages, client: "mobile" }),
        signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new ApiError("Can't reach Vaultwise. Check your connection.", 0);
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      // identity, devices: the same sign-out signals as every other request (http.ts).
      if (res.status === 401 && data?.code === "signed_out") noteSignedOut({ message: data.error ?? null, sentAt });
      if (res.status === 401 && data?.code === "device_revoked") noteDeviceRevoked();
      throw new ApiError(data?.error ?? `Assistant unavailable (${res.status})`, res.status, typeof data?.code === "string" ? data.code : undefined);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      onDelta(await res.text());
      return;
    }
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onDelta(decoder.decode(value, { stream: true }));
    }
  },

  /** Pay with Vaultwise (see orPayDryRun). */
  checkout: (intentId: string): Promise<PaymentIntent> =>
    orPayDryRun(
      () => request<PaymentIntent>(`/pay/checkout/${intentId}`),
      (vaults, cur) => payDryRun.view(intentId, vaults, cur),
    ),
  confirmCheckout: (intentId: string, vaultId: string, pin: string): Promise<PaymentIntent> =>
    orPayDryRun(
      () => post<PaymentIntent>(`/pay/checkout/${intentId}/confirm`, { vaultId, pin }),
      (vaults, cur) => payDryRun.confirm(intentId, vaultId, pin, vaults, cur),
    ),
  /** The sample checkouts: there's no /pay route listing them, so always the dry run's. */
  payIntents: async (): Promise<PaymentIntent[]> => {
    const { vaults, currency } = await liveVaults();
    return payDryRun.list(vaults, currency);
  },
};

/** The API contract. The Practice simulator (./demo) implements all of it (`satisfies Api`). */
export type Api = typeof live;

/**
 * The single entry point screens use. Each call goes to the live API or the Practice simulator
 * depending on the current connection mode.
 */
export const api: Api = new Proxy(live, {
  get(target, prop: keyof Api) {
    const source: Api = isPracticeMode() ? demo : target;
    return observed(prop, source[prop]); // tester
  },
});
