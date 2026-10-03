import { after } from "next/server";
import { customer, handle, json } from "@/lib/api";
import { runPaperEngine, satelliteOverview } from "@/lib/invest/satellite";

export const GET = handle(async () => {
  const user = await customer();
  // Keep the always-on paper engine current without blocking the response.
  if (user.satellite_opt_in) after(() => runPaperEngine(user).catch(() => undefined));
  return json({ ...(await satelliteOverview(user)), currency: user.currency });
});
