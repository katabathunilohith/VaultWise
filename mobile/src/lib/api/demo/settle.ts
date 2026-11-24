import { practiceCheckouts, type PayLedger } from "../pay-sim";
import { requirePracticeMpin } from "./mpin"; // mpin
import { registerPracticeSlice } from "./persist";
import { settleProofs } from "./proofs";
import { currency, recompute, record, S } from "./state";

/** Pay with Vaultwise moves money in the practice vaults, through the simulator's ledger. */
const ledger: PayLedger = {
  vaults: () => S.vaults,
  hold(v, amount) {
    v.held += amount;
    recompute(v);
  },
  release(v, amount) {
    v.held = Math.max(0, v.held - amount);
    recompute(v);
  },
  pay(v, amount, memo, payee) {
    v.balance -= amount;
    recompute(v);
    record("payment", memo, v, -amount, { account: payee, kind: "world" });
  },
};

/** Practice checkouts, paid from the practice vaults, whose balances move. */
export const checkouts = practiceCheckouts(ledger, currency, (pin) => requirePracticeMpin(pin)); // mpin: the simulator's MPIN and lock

registerPracticeSlice({ key: "checkouts", save: checkouts.snapshot, load: checkouts.restore, reset: checkouts.reset });

/**
 * The server runs checks and payments in the background, so a result lands whether or not anyone
 * is watching. Every read that shows balances or statuses settles both first: the proofs whose
 * checks are done, and the payments whose checks or review are done.
 */
export function settleDue() {
  settleProofs();
  checkouts.settle();
}
