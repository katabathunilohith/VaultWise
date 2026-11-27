# Who would pay for a rider’s payout plan?

The first proposed user is a delivery rider paying work expenses out of pocket. The buyer to test is a rider collective or welfare programme that already helps members with cash-flow problems. Riders use the pilot free. The proposed offer is **₹1,500 per month for a group of up to 50 active riders**, including onboarding help and an agreed aggregate measure of follow-up. A sponsor receives no individual balances, bills or pay history. Billing and sponsor reporting are proposed services. No sponsor has committed in the evidence available for this review.

## What it would cost to serve one rider

These rupee amounts are planning assumptions for a dedicated pilot, not the team’s AWS bill. Replace them with a month of measured infrastructure usage and timed support before quoting a customer. An active rider in this model saves a personal plan during the month.

| Monthly cost input | Planning allowance | What to check |
|---|---:|---|
| Web server, address and network base | ₹1,800 fixed | Use the Mumbai region and actual running hours, IP use and invoice. [AWS EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/) |
| SQLite disk and backups | ₹250 fixed | Measure database, snapshots and retention. [AWS EBS pricing](https://aws.amazon.com/ebs/pricing/) |
| Domain and operations allowance | ₹150 fixed | Apportion actual annual renewal and monitoring. |
| Incremental traffic | ₹1 / active rider | Replace with measured transfer and hosting overage. |
| Rider support time | ₹6 / active rider | Assumes three minutes at ₹120/hour. Track minutes for setup and repeat visits. |
| Planner calculation and saved plan | ₹0 in metered AI, payment or platform calls | Both scenarios run in the browser. Saving uses the existing server and SQLite. Email sign-in uses Firebase in a configured deployment. Verify the actual auth tier and quotas. [Firebase pricing](https://firebase.google.com/pricing) |

At **one full group**, fixed costs of ₹2,200 plus ₹350 variable cost total ₹2,550, or **₹51 per active rider**. Revenue would be ₹1,500 and the monthly operating result would be **−₹1,050**. At **two full groups** on the same server, modeled revenue is ₹3,000 against ₹2,900 of costs, leaving **₹100**. Those figures exclude founder salaries beyond the support allowance, acquisition, taxes and product development. Doubling support time alone turns the two-group result into a ₹500 loss. This is a test of whether the offer merits more work.

## Test before treating it as revenue

1. Ask a collective organiser about the last member support service they paid for, who signed and how they judged renewal. Record the alternative they would fund instead.
2. Show one rider completing the planner and an example aggregate report. Ask the organiser to identify a budget owner and accept or decline the ₹1,500 offer for a dated pilot. Record objections, funding source and whether they will commit in writing. No payment collection is built into the app.
3. During six usability sessions ask what the rider used instead, the cash or time that cost, and whether they will use this for their next real payout. A rider’s enthusiasm is evidence about use; only the budget owner can validate the sponsor price.
4. For the first month replace the assumptions with actual spend, active riders and support minutes. If no sponsor commits or the second group requires another server or organiser, revise the offer before projecting returns.
