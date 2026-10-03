import { customer, handle, json, minor } from "@/lib/api";
import { historicalIllustration } from "@/lib/invest/core";

export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const url = new URL(req.url);
  const monthly = minor(Number(url.searchParams.get("monthly") ?? 300));
  const band = url.searchParams.get("band") ? Number(url.searchParams.get("band")) : undefined;
  return json({ ...(await historicalIllustration(user, monthly, band)), currency: user.currency });
});
