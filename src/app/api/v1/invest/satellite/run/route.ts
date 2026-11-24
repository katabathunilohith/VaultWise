import { customer, handle, json } from "@/lib/api";
import { runPaperEngine } from "@/lib/invest";

export const maxDuration = 90;

/**
 * Runs the paper engine now. No MPIN: it only records paper positions and never moves ledger money (the
 * allocation already moved, with the MPIN, at opt-in). The ID gate stays as before.
 */
export const POST = handle(async () => {
  const user = await customer({ tick: false, kyc: true });
  return json(await runPaperEngine(user));
});
