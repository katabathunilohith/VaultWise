/**
 * Personal limits — a commitment device. Customers may *tighten* a limit at
 * any time (always safer), but *loosening* is rationed to once per calendar
 * month. Outside that allowance, an emergency exception can be requested; an
 * AI assessment scores it, a deterministic policy decides, uncertain cases go
 * to a person, and approved increases expire after a fixed window.
 *
 * This file is the module's public surface; see README.md for the file map.
 */
export { LIMIT_KEYS, limitBounds, type Limits, type Bound } from "./bounds";
export { getLimits, effectiveEmergencyCap } from "./store";
export { withdrawnToday, assertWithinWithdrawalLimits } from "./usage";
export { limitsOverview, viewChange } from "./view";
export { changeLimits } from "./change";
export { screenText, type TextScreen } from "./screen";
export { decideLimitRequest, type LimitAssessment, type StoredAssessment } from "./policy";
export { requestEmergencyLimitChange } from "./emergency-request";
export { revertExpiredLimitIncreases } from "./expiry";
export { pendingLimitReviews, reviewLimitChange } from "./review";
