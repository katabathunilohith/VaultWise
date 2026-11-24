# Contract tests: one rule, two copies, the same answers

Some rules live twice: once on the server (`src/lib/**`) and once on the phone (`mobile/src/**`, often
inside the Practice simulator in `mobile/src/lib/api/demo/`), so the phone can check input before it's
sent and Practice can behave like the server with no server. Two copies drift. These tests stop that.

Each rule has one file of **vectors** in [`vectors/`](vectors/): inputs, the expected answer, and a short
`why`. Two runners read the **same** file:

- the server's, here: `tests/contract/<rule>.test.ts` (Vitest, imports the functions from `src/lib`);
- the phone's: `mobile/src/**/__tests__/contract-<rule>.test.ts` (Jest, imports the phone's copy).

## The rule of thumb

**Change a rule → update its vector → both suites must pass.**

```bash
npx vitest run tests/contract          # from the repo root: the server's copy
cd mobile && npx jest contract         # the phone's copy (npm test runs everything)
```

If one side fails after a change, the copies disagree: fix that side (or the vector, if the rule really
changed). Never change a vector just to make one side pass.

## What's covered

| Vectors | Rule | Server | Phone |
|---|---|---|---|
| `mpin-policy.json` | choosing an MPIN, the lock after wrong tries, how a wait is said | `src/lib/mpin` | `mobile/src/features/mpin/policy.ts` |
| `id-numbers.json` | ID types per market, number formats and Aadhaar's checksum, last 4 and masks | `src/lib/kyc/ids.ts` | `mobile/src/lib/api/identity-ids.ts` |
| `untrusted-cap.json` | what an untrusted phone may move per move, per currency | `src/lib/devices/rules.ts` | `mobile/src/lib/api/demo/devices.ts` |
| `device-trust.json` | when a device is trusted, and when it trusts itself | `src/lib/devices/rules.ts` | `mobile/src/lib/api/demo/devices.ts` |
| `emergency-tiers.json` | the emergency cascade: Tier 1, then Tier 2 in category order | `src/lib/emergency.ts` | `mobile/src/lib/api/demo/emergency.ts` |
| `wallet-maths.json` | payday, the daily limit, safe to spend today | `src/lib/wallet/plan.ts` | `mobile/src/lib/api/demo/wallet.ts` |
| `sip-mpin.json` | when saving a Core plan needs the MPIN | `src/lib/invest/sip-rule.ts` | `mobile/src/lib/invest.ts` |
| `money-actions.json` | which money actions need the MPIN, a verified ID, the device cap | `src/lib/money-routes.ts` | the Practice simulator, by behaviour |

`money-actions` is checked differently on each side: the server compares its `MONEY_ROUTES` table (and
fails when the table gains an action with no vector); the phone calls each Practice money move without the
MPIN, with the ID unverified and over the cap on a new phone, and expects `mpin_required`, `kyc_required`
and `device_untrusted` exactly where the table says, in the server's order (ID, then device cap, then MPIN).
Practice's Delete account is the one exemption (Practice has no sign-in, like a server in prototype mode).

Not covered yet (only one side implements them, or they're display text): refusal wording, the emergency
guardrails (cap, requests per week, cooling-off), name matching (server only).

## The vector format

```json
{
  "rule": "sip-mpin",
  "about": "What the rule is, in plain words.",
  "server": "Where the server's copy lives.",
  "phone": "Where the phone's copy lives.",
  "cases": {
    "sipNeedsMpin": [
      { "why": "setting a plan up", "input": { "current": null, "next": { "amount": 100000, "frequency": "monthly" } }, "expected": true }
    ]
  }
}
```

- `cases` holds one list per function or question; a runner must handle every list in its file (a new list
  fails until both runners read it).
- `why` is the test name on both sides: unique in its list, a few words.
- Money is in minor units; times are ms since the epoch. Times used with "which day" maths sit at 11:30 to
  12:00 UTC so the answers are the same in every time zone (CI runs in UTC, laptops don't).
- Keep the input to what both copies take. When the two sides word or draw something differently on
  purpose (refusal messages, `XXXX` vs `••••` masks), compare its shape, not the text, and say so in `about`.

## Adding a rule

1. Find both copies (grep the server and `mobile/src`). Add a vector file only when both really implement it.
2. Write `vectors/<rule>.json`, then `tests/contract/<rule>.test.ts` and
   `mobile/src/**/__tests__/contract-<rule>.test.ts` (helpers: `tests/contract/vectors.ts`,
   `mobile/src/test/contract.ts`).
3. Add the rule to `RUNNERS` in `vectors.test.ts` (server) and `mobile/src/test/__tests__/contract-coverage.test.ts`
   (phone): both fail on a vector file with no runner.
4. Import server code only; never edit it from a test.
