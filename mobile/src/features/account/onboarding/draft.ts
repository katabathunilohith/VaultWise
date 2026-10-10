/**
 * What the customer typed during onboarding, kept in memory between steps. Personal details stay
 * out of route params (they'd show in the address bar on web), and the PIN is never stored here.
 */
export interface OnboardingDraft {
  name: string;
  email: string;
  country: string | null;
  demo: boolean;
}

const EMPTY: OnboardingDraft = { name: "", email: "", country: null, demo: true };
let draft: OnboardingDraft = { ...EMPTY };

export function getDraft(): OnboardingDraft {
  return draft;
}

export function saveDraft(next: OnboardingDraft) {
  draft = { ...next };
}

export function clearDraft() {
  draft = { ...EMPTY };
}

/** True once step 1 is complete (the PIN step can't run without it). */
export function draftReady(d: OnboardingDraft = draft) {
  return d.name.trim().length >= 2 && !!d.country;
}
