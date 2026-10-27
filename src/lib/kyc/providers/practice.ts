import { analyseId } from "../analyse";
import { idHash } from "../secret";
import { otherHolders } from "../store";
import type { KycProvider, KycResult } from "../types";

/**
 * The default provider. Not an official KYC check: it reads the card with the vision model,
 * checks the number's format and checksum, compares the name, looks for edits and for the same
 * ID on another account. Only a clean, confident result is `verified`; everything else waits
 * for a person (`needs_review`). It never rejects on its own.
 */
export const practiceProvider: KycProvider = {
  name: "practice",
  async verify(input): Promise<KycResult> {
    const a = await analyseId({
      docType: input.docType,
      file: input.file,
      typedNumber: input.idNumber,
      accountName: input.user.name,
      market: input.user.market,
    });
    const checks = [...a.checks];
    const reasons = [...a.reasons];
    let clean = a.clean;
    if (a.number) {
      const others = otherHolders(idHash(input.docType, a.number), input.user.id);
      if (others.length) {
        checks.push({ label: "Duplicate ID", status: "fail", detail: `Same ID number on ${others.length} other account(s)` });
        reasons.push("This ID is already linked to another account. A person will take a look.");
        clean = false;
      } else {
        checks.push({ label: "Duplicate ID", status: "pass", detail: "Not used by another account" });
      }
    }
    return {
      status: clean ? "verified" : "needs_review",
      number: a.number,
      nameOnDoc: a.nameOnDoc,
      dob: a.dob,
      checks,
      reasons: clean ? [] : reasons,
    };
  },
};
