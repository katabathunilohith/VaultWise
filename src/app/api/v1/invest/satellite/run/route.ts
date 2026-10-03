import { customer, handle, json } from "@/lib/api";
import { runPaperEngine } from "@/lib/invest/satellite";

export const maxDuration = 90;

export const POST = handle(async () => {
  const user = await customer({ tick: false });
  return json(await runPaperEngine(user));
});
