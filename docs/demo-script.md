# Demo script

> A 5 to 7 minute capstone demo of the web app and the phone app, a backup for each part that can stall, and a checklist for recording a backup video beforehand.

The demo shows three things: money locked to a purpose and released against a checked bill; an emergency path that never waits; and the server checking every money move (MPIN, ledger, audit log). Two people: one talks, one drives the laptop and the phone.

## The day before

- [ ] Pull the latest `main`, then `npm install` in the root and in `mobile/`.
- [ ] `npm test` passes.
- [ ] `.env.local` has `GROQ_API_KEY`, and `npm run test:ai` ends with "The AI is working." Run it the day before, not the hour before: it takes about 3 minutes and uses the free quota.
- [ ] Start the server so phones on the same Wi-Fi can reach it: `npx next dev -H 0.0.0.0`.
- [ ] Onboard at http://localhost:3000 with **Start with demo history** on. It takes about 15 seconds and fetches market prices, which fills the price cache. Choose an MPIN you'll remember (6 digits, not an easy one like `123456`).
- [ ] Open every page in the script once (Overview, Vaults, Family Health Fund, Emergency, Invest → Core, the Ops console at `/admin`), so the dev server has built them and they open quickly.
- [ ] Phone: same Wi-Fi, app open, **Profile → Data source** on Auto or Live server, and **Test connection** answers. Make one small money move to check the phone is trusted. An untrusted phone can only move a small amount ([devices-alerts-otp.md](features/devices-alerts-otp.md)); trust it with a code (shown in the app in test mode), or plan to use Practice for the phone part.
- [ ] Note the totals printed on the sample bills (Hospital invoice, Edited hospital invoice). The amount you withdraw must be at or below the bill's total.
- [ ] Do a full dry run with a timer.
- [ ] Stop the server and copy the whole `data/` folder **outside the repo**, for example to `../vaultwise-demo-data` (Git Bash: `cp -r data ../vaultwise-demo-data`; PowerShell: `Copy-Item -Recurse data ..\vaultwise-demo-data`). This is your clean state. Restore it after every rehearsal: a sample bill that has been used once is declined as reused the next time.
- [ ] Have Practice ready on a second device or the shareable APK. The Practice MPIN is `246810` and texted codes are `123456`; both are shown on screen.
- [ ] Record the backup video (checklist at the end).
- [ ] Laptop: charger, notifications off, screen sleep off, browser zoomed so the back row can read it, phone mirroring tested on the room's screen.

## On the day, before you start

- [ ] Restore the clean `data/` copy (server stopped): delete `data/`, copy `../vaultwise-demo-data` back as `data/`.
- [ ] Start the server and open three tabs: Overview, the Family Health Fund vault, the Ops console.
- [ ] Phone unlocked, on Home, on the live server.
- [ ] The backup video is on the desktop and plays offline.
- [ ] Don't press **Settings → Reset demo**. It deletes the whole database, the price cache included, and a new demo history would have to fetch prices again.

## The script

| Time | Where | Do | Say |
|---|---|---|---|
| 0:00 to 0:30 | Web, Overview | Show the vault cards, saving streak and emergency readiness. | "Vaultwise keeps savings in purpose vaults: health, rent, education. Money comes out against a verified bill. In an emergency it never waits. All money here is pretend." |
| 0:30 to 1:45 | Web, Family Health Fund | **Withdraw with proof**: an amount at or below the Hospital invoice's total, payee City General Hospital, your MPIN, then pick the **Hospital invoice** sample. Watch the six stages. Open the vault's history and point at the new journal. | "The server checked the MPIN before anything else. The bill goes through six stages: file checks, image forensics, the AI read, the rules, tamper checks, then a decision. The AI only read it because we said yes. Approval posts one balanced journal: vault down, bank up." |
| 1:45 to 2:45 | Web, same vault | Withdraw again with the **Edited hospital invoice**. It is declined. Open the report and turn on **ELA**: the pasted-in total lights up. Point at "Totals add up" and "Document reuse". Optionally send an appeal with a short note. | "Someone pasted a bigger total over the real one. Error level analysis finds the region, the line items don't add up to the new total, and the bill's number was already used. Automation only approves clean cases. A decline can be appealed once, to a person." |
| 2:45 to 3:30 | Web, Ops console | Open the review queue (the seeded rent case, and the appeal if you sent one) and decide one. Point at "Ledger reconciles" and the audit chain check. | "Anything doubtful comes here, with a timer. Every money move is a balanced journal in a ledger nobody can edit, and this panel replays all of it to prove the balances. The audit log is hash-chained, so an edited row would show." |
| 3:30 to 5:00 | Phone, live | Show Home (same account). Open **Emergency**, ask for more than the Health vault holds, pick a reason, hold to confirm. On the MPIN sheet, type one wrong MPIN first ("4 tries left"), then the right one. Tier 1 arrives at once; Tier 2 shows its safety pause. | "The phone asks, the server decides. One wrong try costs one of five; five lock money moves for a minute, then longer each time. Tier 1 comes from the Health vault at once. The rest comes from other vaults after a short pause, and we ask for a receipt afterwards, never before." |
| 5:00 to 5:45 | Phone | **Profile → Data source → Demo data**. Show that the app still works: Home, a vault, the MPIN sheet with the Practice MPIN. | "The same app runs with no server at all. Practice mode answers every call on the phone from a copy of the same rules. It's what testers use, and our backup today." |
| 5:45 to 6:30 | Web or a slide | Close. | "What's real: the ledger, the forensics, the AI read with consent, the rules, the MPIN and devices. What's simulated: banks, payouts and licensed ID checks. Over 300 automated tests, including a random test that checks the ledger after every step, and four independent code reviews. We built it with an AI coding assistant, directed and reviewed by us; ask us about any part." |
| 6:30 to 7:00 | | Buffer, or one extra: **Invest → Core** (model portfolio, live quotes), **Settings → Your limits**, or the **Assistant**. | |

Count the tests in the dry run (`npm test` prints the total) and use the real number in the closing line.

## If something stalls

| What you see | What it means | What to do |
|---|---|---|
| The proof sits on the AI step; the web shows "Waiting for model capacity" | Groq's free tier is rate-limited or slow. The call retries for up to 60 seconds, then the bill goes to a person. | Keep talking through the stages. When it lands in review, open the Ops console and approve it yourself: "This is the human path, and it's the same for every bill the AI can't read." |
| The AI fails at once ("at capacity", daily quota) | The day's free quota is used up. | Same as above: every bill goes to a person. |
| You don't trust the AI to answer today | | Before the demo, remove `GROQ_API_KEY` from `.env.local` and restart the server. Every bill skips the AI step and goes to a person; you decide it in the Ops console. The forensics don't need the AI, so the edited bill still shows its ELA heatmap on the reviewer page, and you decline it there. Say so plainly. On the phone, answering **No** to the AI question does the same for one bill. |
| Invest pages are slow, or the chart looks flat | Yahoo Finance is slow or blocked. Each price fetch waits up to 12 seconds, then the server uses the last cached prices, however old, then a made-up series (`getSeries()` in `src/lib/invest/market.ts`). | Skip Invest; it isn't in the main script. Prices fetched the day before are still in the cache unless the demo was reset. |
| The phone can't reach the server | Wi-Fi or firewall. On Auto, an app that can't reach the server at launch uses demo data and says so. | Switch to **Profile → Data source → Demo data** and do the phone part in Practice (MPIN `246810`). Everything works with no server; bills are decided by the sample's name. |
| The phone says it isn't trusted yet | The new-device cap. | Ask for a small amount, or switch to Practice. |
| The live MPIN is locked | Five wrong tries. The first lock lasts 1 minute. | Explain the lock while it runs (it is the feature), or switch to Practice. In Practice, **Settings → Start Practice over** clears the count. |
| A sample is declined as reused | It was already used in this database. | Restore the clean `data/` copy before the demo. In the moment, use the Pharmacy receipt, or explain the reuse check: it just worked. |
| The database is in a strange state | | Stop the server, restore the copy, start again. Under a minute. |
| The laptop or projector fails | | Play the backup video and talk over it. |

## Recording the backup video

- [ ] Record after the last dry run, on a freshly restored clean `data/` copy, with the AI on.
- [ ] Record the laptop screen at 1080p. Record the phone with its own screen recorder or through mirroring.
- [ ] Follow the script in the same order, in 5 to 7 minutes.
- [ ] It shows: the approved bill with its six stages; the declined bill with ELA turned on; the Ops console (a decision, "Ledger reconciles", the audit chain check); the phone emergency request with the MPIN sheet (one wrong try, then the right one) and the safety pause; the switch to Practice.
- [ ] Don't cut the six stages short: the audience should see the check run for real.
- [ ] Narrate it, or add captions. Check that the sound is clear and the text is readable on a projector.
- [ ] Nothing personal on screen: notifications off, demo names only, no real phone number or email.
- [ ] Put the date and the commit in the file name (`git log -1 --oneline`), so it matches the code you show.
- [ ] Keep two copies: on the presentation laptop and on a USB stick. Check it plays offline on the laptop you'll use.
- [ ] Restore the clean `data/` copy afterwards.

## Questions to expect

The walkthroughs have short answers to the usual questions: [the ledger](walkthroughs/ledger.md), [the MPIN](walkthroughs/mpin.md) and [the verification pipeline](walkthroughs/verification-pipeline.md). How the project was made is in [how-this-was-built.md](how-this-was-built.md).
