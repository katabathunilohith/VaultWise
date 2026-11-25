import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Every test file gets its own throwaway database, never the demo one.
process.env.VAULTWISE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vaultwise-test-"));
// Tests must not call the AI provider.
delete process.env.GROQ_API_KEY;

// Tests must not use the network (B21). Market prices come from a deterministic fake (tests/helpers/prices.ts),
// imported only after VAULTWISE_DATA_DIR is set; a test can swap it with setPriceProvider().
const { setPriceProvider } = await import("@/lib/invest/prices");
const { fakePrices } = await import("./helpers/prices");
setPriceProvider(fakePrices());
// Anything else that reaches for fetch without mocking it fails the way a machine with no connection does
// (undici's TypeError "fetch failed"). Tests that mock fetch (vi.stubGlobal) get this back when they unstub.
// The one exception is the live AI check (`npm run test:ai`, scripts/test-ai.mjs), which sets GROQ_LIVE_KEY:
// it may reach Groq's API host, and nothing else.
const realFetch = globalThis.fetch;
const liveHosts = new Set(process.env.GROQ_LIVE_KEY ? ["api.groq.com"] : []);
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // not an absolute URL: treated like any other address
  }
  if (liveHosts.has(host)) return realFetch(input, init);
  throw new TypeError(`fetch failed: tests have no network (${url})`);
}) as typeof fetch;
