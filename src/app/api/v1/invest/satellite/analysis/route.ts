import { customer, handle, json } from "@/lib/api";
import { marketAnalysis } from "@/lib/invest/satellite";
import type { Interval } from "@/lib/invest/market";

export const GET = handle(async (req: Request) => {
  await customer({ tick: false });
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "BTC-USD";
  const tf = (url.searchParams.get("tf") ?? "4h") as Interval;
  const bars = Math.min(400, Math.max(60, Number(url.searchParams.get("bars") ?? 160)));
  return json(await marketAnalysis(symbol, ["1h", "4h", "1d"].includes(tf) ? tf : "4h", bars));
});
