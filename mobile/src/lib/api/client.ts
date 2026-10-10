import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { getConnection } from "./connection";
import { demo, payDryRun } from "./demo";
import { ApiError } from "./errors";
import type { PaymentIntent } from "./pay-types";
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

const TIMEOUT_MS = 20_000;

async function request<T>(path: string, init: RequestInit = {}, opts: { timeoutMs?: number; acceptStatus?: number[] } = {}): Promise<T> {
  const { baseUrl } = getConnection();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: init.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch (e) {
    throw new ApiError(
      (e as Error)?.name === "AbortError" ? "Vaultwise took too long to answer. Try again." : "Can't reach Vaultwise. Check your connection.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok && !opts.acceptStatus?.includes(res.status)) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/** Builds a multipart body that works on native (uri objects) and on web (Blobs). */
async function formWith(file: UploadFile, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  return form;
}

const liveVaults = () => request<{ vaults: Vault[]; currency: string }>("/vaults");

/** The server answers 404 for /pay/* until those routes are deployed. */
const payNotDeployed = (e: unknown) => e instanceof ApiError && e.status === 404;

const live = {
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
  withdraw: (vaultId: string, amountMajor: number, payee: string, note?: string) =>
    post<{ id: string; status: string }>(`/vaults/${vaultId}/withdrawals`, { amount: amountMajor, payee, note }),
  cancelWithdrawal: (id: string) => request<{ ok: true }>(`/withdrawals/${id}`, { method: "DELETE" }),
  uploadProof: async (vaultId: string, withdrawalId: string, file: UploadFile) =>
    request<{ id: string; status: string }>(`/vaults/${vaultId}/proofs`, { method: "POST", body: await formWith(file, { withdrawalId }) }),
  proof: (id: string) => request<ProofView>(`/proofs/${id}`),
  appeal: (id: string, note: string) => post<{ ok: true }>(`/proofs/${id}/appeal`, { note }),
  emergency: () => request<EmergencyOverview>("/emergency"),
  emergencyPreview: (amountMajor: number) => post<EmergencyPreview>("/emergency/preview", { amount: amountMajor }),
  // A request a safety limit stops comes back as 422 with the plan explaining why; keep that body.
  emergencyWithdraw: (input: EmergencyInput) =>
    request<EmergencyResult>("/emergency/withdrawals", { method: "POST", body: JSON.stringify(input) }, { acceptStatus: [422] }),
  emergencyReceipt: async (id: string, file: UploadFile) =>
    request<{ id: string; status: string }>(`/emergency/${id}/receipt`, { method: "POST", body: await formWith(file) }),
  limits: () => request<LimitsOverview>("/limits"),
  setLimits: (major: Partial<Record<LimitKey, number>>) => request<{ overview: LimitsOverview }>("/limits", { method: "PUT", body: JSON.stringify(major) }),
  portfolio: () => request<Portfolio>("/portfolio"),
  investCore: () => request<InvestCore>("/invest/core"),
  investSatellite: () => request<Record<string, unknown>>("/invest/satellite"),
  buyCore: (amountMajor: number) => post<{ fills: unknown[] }>("/invest/core/buy", { amount: amountMajor }),
  setSip: (amountMajor: number, frequency: "weekly" | "monthly") => post<{ ok: true }>("/invest/core/sip", { amount: amountMajor, frequency }),
  cancelSip: () => request<{ ok: true }>("/invest/core/sip", { method: "DELETE" }),
  region: () => request<{ guess: { country: string | null; supported: boolean; source: string | null; detail: string | null } }>("/region"),
  /** Wipes the server wallet (Settings → Delete account in Practice). The simulated checkouts start over with it. */
  reset: async () => {
    const res = await post<{ ok: true }>("/reset");
    payDryRun.reset();
    return res;
  },
  /** Full data export (JSON), opened in the browser. */
  exportUrl: () => `${getConnection().baseUrl}/api/v1/me/export`,
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
    try {
      res = await expoFetch(`${getConnection().baseUrl}/api/v1/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, client: "mobile" }),
        signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new ApiError("Can't reach Vaultwise. Check your connection.", 0);
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(data?.error ?? `Assistant unavailable (${res.status})`, res.status);
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

  /**
   * Pay with Vaultwise. While /pay/* isn't deployed, the checkout is simulated on the device as a
   * dry run against the customer's own vaults (never the demo's sample vaults): balances are
   * checked, nothing is paid or held, and the intent is marked `dryRun` so the screens say so.
   */
  checkout: async (intentId: string): Promise<PaymentIntent> => {
    try {
      return await request<PaymentIntent>(`/pay/checkout/${intentId}`);
    } catch (e) {
      if (!payNotDeployed(e)) throw e;
    }
    const { vaults, currency } = await liveVaults();
    return payDryRun.view(intentId, vaults, currency);
  },
  confirmCheckout: async (intentId: string, vaultId: string, pin: string): Promise<PaymentIntent> => {
    try {
      return await post<PaymentIntent>(`/pay/checkout/${intentId}/confirm`, { vaultId, pin });
    } catch (e) {
      if (!payNotDeployed(e)) throw e;
    }
    // Fresh balances, so the dry run checks what the vault really has available now.
    const { vaults, currency } = await liveVaults();
    return payDryRun.confirm(intentId, vaultId, pin, vaults, currency);
  },
  demoIntents: async (): Promise<PaymentIntent[]> => {
    const { vaults, currency } = await liveVaults();
    return payDryRun.list(vaults, currency);
  },
};

export type Api = typeof live;

/** Compile-time guard: the demo simulator implements every live method. */
const demoCoversApi: { [K in keyof Api]: unknown } = demo;
void demoCoversApi;

/**
 * The single entry point screens use. Each call goes to the live API or the demo
 * simulator depending on the current connection mode.
 */
export const api: Api = new Proxy(live, {
  get(target, prop: keyof Api) {
    const source = getConnection().mode === "demo" ? (demo as unknown as Api) : target;
    return source[prop] ?? target[prop];
  },
});
