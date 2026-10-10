/** Every failed call, live or demo, throws this. `message` is safe to show to the customer. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Some server messages were written for the web app or the ledger and use internal terms.
 * They are rewritten into plain words (DESIGN.md section 5) before anyone sees them.
 */
const PLAIN: [RegExp, string][] = [
  [/insufficient funds/i, "There isn't enough money there for this."],
  [/complete the risk profile first/i, "Finish the short risk quiz first. It's in Vaultwise on the web for now."],
  [/^request failed \(5\d\d\)$/i, "Something went wrong on our side. Try again in a moment."],
  [/^request failed \(4\d\d\)$/i, "That didn't go through. Check the details and try again."],
  [/attestation/i, "Confirm this is a genuine emergency to continue."],
  [/velocity|guardrail/i, "That's past one of your safety limits."],
];

export function errorMessage(e: unknown, fallback = "Something went wrong. Try again.") {
  const raw = e instanceof Error && e.message ? e.message : "";
  if (!raw) return fallback;
  for (const [re, plain] of PLAIN) if (re.test(raw)) return plain;
  if (e instanceof TypeError) return "Can't reach Vaultwise. Check your connection.";
  return raw;
}
