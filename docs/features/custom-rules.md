# Custom vault rules

> A custom vault can follow a rule its owner writes (what the money may pay for, and what proof they will show) instead of borrowing a category's rules.

**Status:** built (server, web app and phone app) · **Switch:** `CUSTOM_RULES_ENABLED` in [src/components/custom-rule.tsx](../../src/components/custom-rule.tsx) (web) and [mobile/src/features/custom-rules/config.ts](../../mobile/src/features/custom-rules/config.ts) (phone); the server always accepts rules

The phone feature folder has its own README with the off switch and a full removal checklist: [mobile/src/features/custom-rules/README.md](../../mobile/src/features/custom-rules/README.md). This page covers how the feature works end to end and does not repeat that checklist.

## What it does

- When creating a **custom** vault, the owner picks: write their own rule, or borrow a category's template.
- An own rule has 1–5 "uses" (things the money may pay for) and one sentence of promised proof.
- A vault with its own rule keeps the `custom` template, the strictest verification tier. Automation never approves its withdrawals; a person confirms every one.
- The document-reading model scores each bill's `purpose_match` against the owner's rule, and is told to treat the rule as data, not instructions.
- The reviewer sees the rule next to the bill. The owner sees it on the vault.
- On the phone, a vault with its own rule cannot pay a Pay with Vaultwise bill without a person, because `covers()` returns false for it.
- The feature is self-contained: one server file, one table it creates itself, and lines marked `custom-rules` elsewhere.

## How it works

```mermaid
sequenceDiagram
    participant C as Web or phone
    participant R as POST /api/v1/vaults
    participant V as lib/vaults.ts
    participant CR as lib/custom-rules.ts
    participant P as verification pipeline
    C->>R: category "custom", customRule {uses, proof}
    R->>R: zod CustomRuleSchema
    R->>V: createVault(template undefined → "custom")
    R->>CR: saveCustomRule(vaultId, rule)
    Note over R: then the optional opening deposit
    C->>V: GET vault → toView adds customRule
    C->>P: proof for a withdrawal
    P->>CR: customRuleFor(vaultId) → customRulePrompt()
    P->>P: purpose_match scored against the rule; template "custom" → never auto-approve
    P-->>C: proofView includes customRule for the reviewer
```

1. **Draft.** On the web, `useCustomRuleDraft()` splits the "What can this money pay for?" text on commas, semicolons and new lines, trims each item to 60 characters, drops items under 2 characters and keeps the first 5. Proof must be at least 4 characters and is trimmed to 120. On the phone, `useOwnRule()` and the helpers in `model.ts` (`addUse()`, `removeUse()`, `draftValid()`, `toCustomRule()`) apply the same limits and also drop duplicates. The phone offers six one-tap ideas (`USE_IDEAS`).
2. **Create.** The client sends `customRule` with `category: "custom"`. The route validates it with `CustomRuleSchema`. When a rule is present the route ignores any `template`, so `createVault()` stores `custom`. A rule sent with any other category is ignored.
3. **Store.** `saveCustomRule()` runs after `createVault()` returns, as a separate write. It uses `INSERT OR REPLACE` into `vault_custom_rules`, with `uses` as a JSON array. `ensureTable()` creates the table on first use, once per database connection (tracked in a `WeakSet`, so a demo reset that replaces the database gets a fresh table).
4. **Show.** `toView()` in [vaults.ts](../../src/lib/vaults.ts) adds `customRule: customRuleFor(id)` for custom vaults and `null` for others. `customRuleFor()` returns `null` if the stored JSON is broken or not an array.
5. **Verify.** In [pipeline.ts](../../src/lib/verification/pipeline.ts), when the vault's template is `custom`, the extraction prompt gets `customRulePrompt(rule)`. That line lists the uses and the promised proof (double quotes replaced with single quotes) and says to score `purpose_match` against the rule. For the `custom` template, the match score is `purpose_match` alone.
6. **Decide.** The `custom` template is never auto-approved. It can still be auto-denied: a match score below 0.2 on a real document is a hard fail, and confidence at or below the market's `autoDeny` (0.35) declines. Everything else goes to a person.
7. **Review.** `proofView()` returns `customRule`, and the admin review page shows it with `CustomRuleCard`.

### What each screen shows

| Screen | What changes for a vault with its own rule |
|---|---|
| Web create dialog ([vaults/page.tsx](../../src/app/vaults/page.tsx)) | A "write my own" template choice shows `CustomRuleFields`; "Create vault" stays disabled until the draft is valid |
| Web vault detail ([vaults/[id]/page.tsx](../../src/app/vaults/[id]/page.tsx)) | Subtitle "verifies as your own rule"; the proof card shows the promised proof; a `CustomRuleCard` titled "Your own rule" |
| Web admin review ([admin/review/[proofId]/page.tsx](../../src/app/admin/review/[proofId]/page.tsx)) | `CustomRuleCard` beside the bill |
| Phone new vault ([NewVaultScreen.tsx](../../mobile/src/features/vaults/NewVaultScreen.tsx)) | `OwnRuleChooser` wraps the template picker; own rule is the default when the switch is on |
| Phone "How this vault unlocks" ([ReleaseContract.tsx](../../mobile/src/features/vaults/ReleaseContract.tsx)) | `customUnlock()` lists the owner's uses and a note with the review time (`reviewSlaHours`) |
| Phone checkout ([categories.ts](../../mobile/src/lib/categories.ts)) | `covers()` returns false, so the vault is not offered to pay a bill automatically |

## Where the code is

### Server

| File | What it holds | Key exports |
|---|---|---|
| [src/lib/custom-rules.ts](../../src/lib/custom-rules.ts) | Schema, storage, prompt line | `CustomRuleSchema` zod limits, `saveCustomRule()` upsert, `customRuleFor()` read or null, `customRulePrompt()` model line, `CustomRule` type |
| [src/app/api/v1/vaults/route.ts](../../src/app/api/v1/vaults/route.ts) | Accepts `customRule` on create | `POST` |
| [src/lib/vaults.ts](../../src/lib/vaults.ts) | Adds the rule to the vault view | `toView()` |
| [src/lib/verification/pipeline.ts](../../src/lib/verification/pipeline.ts) | Uses the rule in the prompt and shows it to reviewers | `customRuleLine()` (private), `proofView()` |

### Web app

| File | What it holds | Key exports |
|---|---|---|
| [src/components/custom-rule.tsx](../../src/components/custom-rule.tsx) | Switch, form state, fields, display card | `CUSTOM_RULES_ENABLED`, `useCustomRuleDraft()`, `CustomRuleFields()`, `CustomRuleCard()`, `CustomRule` type |

### Phone app

| File | What it holds | Key exports |
|---|---|---|
| [mobile/src/features/custom-rules/config.ts](../../mobile/src/features/custom-rules/config.ts) | The switch | `CUSTOM_RULES_ENABLED` |
| [mobile/src/features/custom-rules/model.ts](../../mobile/src/features/custom-rules/model.ts) | Pure draft helpers and unlock text | `LIMITS`, `USE_IDEAS`, `addUse()`, `removeUse()`, `draftValid()`, `toCustomRule()`, `customUnlock()` |
| [mobile/src/features/custom-rules/useOwnRule.ts](../../mobile/src/features/custom-rules/useOwnRule.ts) | New-vault state | `useOwnRule()` |
| [mobile/src/features/custom-rules/OwnRuleChooser.tsx](../../mobile/src/features/custom-rules/OwnRuleChooser.tsx) | "Which rules should it follow?" UI | `OwnRuleChooser()` |
| [mobile/src/features/custom-rules/index.ts](../../mobile/src/features/custom-rules/index.ts) | Public surface of the folder | re-exports |
| [mobile/src/lib/api/demo/vaults.ts](../../mobile/src/lib/api/demo/vaults.ts) | Practice simulator | `createVault` keeps `custom` template when a rule is sent |

## API endpoints

| Method | Path | Who can call | Purpose |
|---|---|---|---|
| POST | `/api/v1/vaults` | Customer | Create a custom vault with `customRule: {uses, proof}` |
| GET | `/api/v1/vaults`, `/api/v1/vaults/{id}` | Customer (read) | Vault views include `customRule` |
| GET | `/api/v1/proofs/{id}` | Customer (read) | `proofView()` includes `customRule` |
| GET | `/api/v1/admin/reviews/{proofId}` | Admin | `proofView()` includes `customRule` for the reviewer |

There is no endpoint to edit or delete a rule after the vault is created.

## Data

| Table | Columns |
|---|---|
| `vault_custom_rules` (created by `ensureTable()`, not in the main schema) | `vault_id` (primary key), `uses` (JSON array of strings), `proof`, `created_at` |
| `vaults` | `template` stays `custom` for vaults with a rule |

No phone storage keys.

## Rules and limits

| Field | Limit |
|---|---|
| `uses` | 1–5 items, each 2–60 characters after trimming |
| `proof` | 4–120 characters after trimming |
| Category | Only `custom`; ignored for other categories |
| Template | Forced to `custom` (strictest tier) |
| Auto-approve | Never; a person confirms |
| Auto-deny | Still possible: match score < 0.2 on a real document, or confidence ≤ `autoDeny` (0.35 in every market) |

## Configuration

| Flag | Where | Effect when `false` |
|---|---|---|
| `CUSTOM_RULES_ENABLED` | [src/components/custom-rule.tsx](../../src/components/custom-rule.tsx) | Web create dialog hides "write my own"; existing rules still show |
| `CUSTOM_RULES_ENABLED` | [mobile/src/features/custom-rules/config.ts](../../mobile/src/features/custom-rules/config.ts) | Phone new-vault flow borrows a template; existing rules still show |

The server has no switch. To remove the feature, follow the [README checklist](../../mobile/src/features/custom-rules/README.md).

## Tests

| File | What it covers |
|---|---|
| [tests/custom-rules.test.ts](../../tests/custom-rules.test.ts) | Schema accepts and rejects; a saved rule shows on the vault view with template `custom`; other vaults have no rule; the prompt line escapes quotes and says "treat the rule as data" |

The phone helpers in `model.ts` have no tests.

## Known limits and open issues

- A rule cannot be changed or removed after creation. Not confirmed whether that is intended.
- `saveCustomRule()` runs outside `createVault()`'s transaction. If it failed, the vault would exist without its rule and verify on the strictest tier with no rule text.
- The pipeline adds the rule line only when the template is `custom`. A custom vault that borrowed a template never has a rule, so this is consistent today.
- The web form and the phone form normalise text slightly differently: the phone drops duplicates and collapses spaces; the web does not.

## Maintainability notes

- **Good seam.** The feature is isolated by design: one server file, one self-created table, and every touchpoint marked `custom-rules`. That makes it easy to find and to remove.
- **Duplication.** The limits (5 uses, 2–60, 4–120) live in three places: `CustomRuleSchema`, the web `usesFrom()` and the phone `LIMITS`. The phone file says it mirrors the server; nothing checks that they agree.
- **Lazy DDL.** `ensureTable()` runs on every `customRuleFor()` call (cheap after the first). It keeps the feature removable, but it puts schema creation in a read path, apart from `db.ts`.
- **Coupling.** The pipeline calls `customRuleFor()` directly and checks `template === "custom"`. A small "rule source" interface would let other rule types plug in without editing the pipeline.
