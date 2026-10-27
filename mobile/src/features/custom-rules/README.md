# Custom vault rules

A custom vault can follow its owner's own rule instead of borrowing a category's. The owner writes up to five things the money can pay for, plus the proof they'll show. A person checks every withdrawal against that rule.

## Switch it off

Set `CUSTOM_RULES_ENABLED` to `false` in `config.ts`. New custom vaults then borrow a category's rules, as before. Vaults already made with their own rule still show it.

On the web app, the same switch is `CUSTOM_RULES_ENABLED` in `src/components/custom-rule.tsx`.

## Remove it completely

Delete this folder, then remove each line marked `custom-rules`:

| Where | What to remove |
|---|---|
| `mobile/src/features/vaults/NewVaultScreen.tsx` | `useOwnRule`, `OwnRuleChooser` and the `customRule` field |
| `mobile/src/features/vaults/ReleaseContract.tsx` | the `customUnlock` call and the `customRule` prop |
| `mobile/src/lib/api/types.ts` | `CustomRule`, `Vault.customRule`, `CreateVaultInput.customRule` |
| `mobile/src/lib/api/demo/vaults.ts` | the `customRule` lines in `createVault` |
| `mobile/src/lib/categories.ts` | the `customRule` field of `RulesSource` and its check in `covers` |
| `src/lib/custom-rules.ts` (server) | the whole file |
| `src/app/api/v1/vaults/route.ts`, `src/lib/vaults.ts`, `src/lib/verification/pipeline.ts` | the `custom-rules` lines |
| `src/components/custom-rule.tsx` (web) and the pages that import it | the whole file and its lines |

The server keeps rules in their own table, `vault_custom_rules`, which it creates on first use. No other table changes, so no migration needs undoing.
