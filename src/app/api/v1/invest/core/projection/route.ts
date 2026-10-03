import { customer, handle, json } from "@/lib/api";
import { projection, requireProfile } from "@/lib/invest/core";

export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const url = new URL(req.url);
  const band = Number(url.searchParams.get("band") ?? requireProfile(user).band);
  const monthly = Math.max(0, Math.round(Number(url.searchParams.get("monthly") ?? 300) * 100));
  const initial = Math.max(0, Math.round(Number(url.searchParams.get("initial") ?? 0) * 100));
  const years = Math.min(40, Math.max(1, Number(url.searchParams.get("years") ?? 15)));
  return json({ ...projection({ band, monthly, initial, years }), currency: user.currency });
});
