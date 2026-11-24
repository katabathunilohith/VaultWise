/**
 * MPIN: a 6-digit PIN the server checks for every money move, with an escalating lock on wrong
 * tries. See README.md for the switch (MPIN_ENFORCED) and every touch point outside this folder
 * (marked `// mpin`). Which actions need it lives in `src/lib/money-routes.ts`.
 */
export { mpinEnforced, MPIN_LENGTH, TRIES_PER_LOCK, LOCK_STEPS_MS } from "./config";
export { checkNewMpin, birthDateAsPin, COMMON_MPINS, type WeakReason, type MpinCheck } from "./policy";
export { lockMsAfter, triesLeftAfter, attemptState, activeLock } from "./attempts";
export { upgradeDue } from "./meta";
export { requireMpin, mpinStatus, MpinError, waitText } from "./verify";
export { mpinField, assertNewMpin, recordChosenMpin, setMpin, changeMpin } from "./change";
