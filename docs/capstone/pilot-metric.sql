-- Run read-only on a dedicated, consented Indian pilot database. Prints aggregates only.
-- Keep the first prospective plan for each account so retries and resaves cannot inflate the count.
WITH prospective AS (
  SELECT user_id, actual_date, checked_at,
         date(created_at / 1000, 'unixepoch', '+330 minutes') AS saved_day,
         json_extract(input_json, '$.expectedPayoutDate') AS expected_day,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, rowid) AS plan_number
  FROM payout_plans
  WHERE is_example = 0 AND currency = 'INR'
    AND date(created_at / 1000, 'unixepoch', '+330 minutes') < json_extract(input_json, '$.expectedPayoutDate')
),
eligible AS (
  SELECT *, date(expected_day, '+7 days') AS deadline
  FROM prospective
  WHERE plan_number = 1 AND date('now', '+330 minutes') > date(expected_day, '+7 days')
),
totals AS (
  SELECT count(*) AS riders_due,
         count(CASE WHEN actual_date >= saved_day AND
                date(checked_at / 1000, 'unixepoch', '+330 minutes') BETWEEN saved_day AND deadline
                THEN 1 END) AS riders_checked_in
  FROM eligible
)
SELECT riders_due, riders_checked_in,
       round(100.0 * riders_checked_in / nullif(riders_due, 0), 1) AS checkin_percent
FROM totals;
