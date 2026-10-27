import { Platform } from "react-native";
import { authReady, getIdToken } from "../auth/firebase"; // identity
import { getSession } from "../auth/session-state";
import { getConnection } from "./connection";
import { ApiError } from "./errors";
import type { UploadFile } from "./types";

/** HTTP to the Vaultwise API: JSON in and out, friendly errors, multipart uploads. */

const TIMEOUT_MS = 20_000;

/**
 * identity: `Authorization: Bearer <ID token>` while someone is signed in (Firebase) and `baseUrl`
 * is the server their login belongs to; nothing otherwise, so a token never goes to an address
 * typed in later. Waits for the saved session to load first, so start-up requests aren't sent
 * unsigned. A token that can't be fetched (offline) fails the request instead of sending it signed out.
 */
export async function authHeaders(baseUrl: string): Promise<Record<string, string>> {
  await authReady();
  let token: string | null;
  try {
    token = await getIdToken(baseUrl);
  } catch {
    throw new ApiError("Can't reach Vaultwise. Check your connection.", 0);
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The person's answer to "may an AI read the bills and IDs I send?" (features/ai-consent). Until
 * they say yes it is "no", and the server keeps their data away from the AI provider.
 */
function aiConsentHeader(): Record<string, string> {
  return { "x-ai-consent": getSession().aiChecks === true ? "yes" : "no" };
}

export async function request<T>(path: string, init: RequestInit = {}, opts: { timeoutMs?: number; acceptStatus?: number[] } = {}): Promise<T> {
  const { baseUrl } = getConnection();
  const auth = { ...(await authHeaders(baseUrl)), ...aiConsentHeader() }; // identity, ai-consent
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: init.body instanceof FormData ? { ...auth, ...init.headers } : { "Content-Type": "application/json", ...auth, ...init.headers },
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
    const body = data as { error?: string; code?: string } | null;
    const msg = body?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, typeof body?.code === "string" ? body.code : undefined); // identity: code
  }
  return data as T;
}

export const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/** Builds a multipart body that works on native (uri objects) and on web (Blobs). */
export async function formWith(file: UploadFile, fields: Record<string, string> = {}) {
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

