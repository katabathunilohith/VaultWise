import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { creditIncome, recordSpend } from "@/lib/vaults";
import { CURRENCY_SCALE } from "@/lib/shared";

const SPENDS: [string, string, number, number][] = [
  ["FreshMart Groceries", "groceries", 18, 96],
  ["Corner Coffee", "coffee", 3.1, 6.8],
  ["Metro Transit", "transport", 2.5, 9.5],
  ["Noodle House", "dining", 12, 46],
  ["Bookshop & Co", "shopping", 8, 39],
  ["Greenleaf Pharmacy", "health", 6, 28],
];

/** Simulated open-banking events for the demo: a salary credit or a few card purchases. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ type: z.enum(["salary", "spend"]) }));
  const m = CURRENCY_SCALE[user.currency] ?? 1;
  if (b.type === "salary") {
    const r = creditIncome(user, Math.round(2150 * m * 100), "Acme Analytics Inc.");
    return json({ ok: true, swept: r.swept });
  }
  const created: string[] = [];
  for (let k = 0; k < 3; k++) {
    const [merchant, category, lo, hi] = SPENDS[Math.floor(Math.random() * SPENDS.length)];
    created.push(recordSpend(user, merchant, category, Math.round((lo + Math.random() * (hi - lo)) * m * 100)));
  }
  return json({ ok: true, created });
});
