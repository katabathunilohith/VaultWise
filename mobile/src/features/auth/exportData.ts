import { Platform } from "react-native";
import { getConnection } from "@/lib/api/connection";
import { ApiError } from "@/lib/api/errors";
import { authHeaders } from "@/lib/api/http";

/**
 * identity: Export my data while signed in. The export needs the sign-in token, which a browser
 * opened at the address can't send. In the web preview it's fetched with the token and saved as a
 * file; on a phone there's no way to save a file without a new dependency yet, so it says
 * "unsupported" and Settings explains where to get it instead.
 */
export async function downloadSignedInExport(url: string): Promise<"saved" | "unsupported"> {
  if (Platform.OS !== "web" || typeof document === "undefined") return "unsupported";
  let res: Response;
  try {
    res = await fetch(url, { headers: await authHeaders(getConnection().baseUrl) });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("Can't reach Vaultwise. Check your connection.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `vaultwise-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return "saved";
}
