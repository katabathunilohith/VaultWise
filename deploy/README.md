# Putting Vaultwise online

> A step-by-step guide for someone who has never set up a server. It follows [plan 05](../docs/plans/05-server-online.md):
> one small AWS EC2 server in Mumbai runs the Vaultwise server and its SQLite database, Caddy gives it HTTPS,
> and backups run every night. Money stays pretend; this only makes accounts real.

**Our server:** [vaultwise.online](https://vaultwise.online), set up with this guide in November 2026. It's an EC2 `t3.small`
in Mumbai running Ubuntu, with an Elastic IP, the domain's DNS at Hostinger, and Firebase sign-in. (Plan 05 first chose
Lightsail; we built it on EC2. The software on the server is the same.)

**Time:** about two hours the first time. **Cost:** roughly US$20 to 25 a month for a `t3.small`, its disk and its public
IP address (check the EC2 pricing page for Mumbai; new AWS accounts may get free credits), a little more for snapshots,
plus a domain (roughly ₹200 to ₹1,500 a year).

## Who does what

Steps marked **YOU ONLY** need an account, a payment card or a decision that only the project owner can make. Everything
else is copy and paste, and anyone on the team (or Claude, given SSH access) can do it.

| Step | What | Who |
|---|---|---|
| 1 | AWS account | **YOU ONLY** (payment card) |
| 2 | Domain name | **YOU ONLY** (payment) |
| 3 | Firebase project and sign-in | **YOU ONLY** (Google account) |
| 4 | Groq API key (optional) | **YOU ONLY** |
| 5 to 7 | Launch the server, Elastic IP, security group | **YOU ONLY** (in your AWS account) |
| 8 | Point the domain at the server | **YOU ONLY** (at your domain registrar) |
| 9 to 15 | Install, configure, start, HTTPS, checks | Anyone |
| 16 | Disk encryption check and daily snapshots | **YOU ONLY** (AWS console) |
| 17 | Nightly backups (and optional S3 copy) | Anyone (S3 bucket: **YOU ONLY**) |
| 18 | Test a restore | Anyone |
| 19 | Uptime check | **YOU ONLY** (free account) |
| 20 | Phone `tester-live` build | **YOU ONLY** (Expo account) |

Wherever you see `vaultwise.example.com` or `YOUR-DOMAIN`, use your own domain (ours is `vaultwise.online`), and wherever
you see `YOUR-ELASTIC-IP`, use the address from step 6.

---

## Part A. Accounts (YOU ONLY)

### 1. AWS account

1. Sign up at [aws.amazon.com](https://aws.amazon.com/). You need a payment card; India cards work.
2. Turn on multi-factor authentication for the root user: top-right menu → **Security credentials** → **Assign MFA device**.
3. Optional but wise: in **Billing → Budgets**, create a monthly budget of US$30 that emails you, so a surprise bill can't happen.

### 2. A domain

Buy a domain from any registrar (GoDaddy, Namecheap, Cloudflare, Hostinger, BigRock...). A subdomain of a domain you
already own works too, for example `vaultwise.yourname.in`. Ours, `vaultwise.online`, is registered at Hostinger.

Use a name you only use for Vaultwise: the server tells browsers to use HTTPS for it (and its subdomains) for two years.

### 3. Firebase project (sign-in)

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) → **Add project**. Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Authentication → Settings → Authorised domains → Add domain**: your domain from step 2.
4. **Project settings** (gear icon) **→ General → Your apps → Web (`</>`)**: register an app called "Vaultwise web".
   Keep the page open; you'll copy `apiKey`, `authDomain`, `projectId` and `appId` from the config it shows in step 11.
5. Decide who reviews bills and IDs. Each reviewer signs up on the website later with that email and verifies it.

### 4. Groq API key (optional)

The AI reads bills and IDs (only for people who agree) and powers the assistant. Without a key, a person reviews every
bill and the assistant is off. Create a key at [console.groq.com/keys](https://console.groq.com/keys).

---

## Part B. The server

### 5. Launch the EC2 instance (YOU ONLY)

1. Open the [EC2 console](https://console.aws.amazon.com/ec2/). In the region menu at the top right, pick
   **Asia Pacific (Mumbai) `ap-south-1`**.
2. **Launch instance**. **Name:** `vaultwise`.
3. **Application and OS image:** **Ubuntu** → the newest **Ubuntu Server LTS** (24.04 or later), 64-bit (x86).
4. **Instance type:** `t3.small` (2 GB memory). Check the hourly price it shows.
5. **Key pair:** **Create new key pair** → name `vaultwise`, type ED25519 (or RSA), format `.pem`. It downloads; store it
   safely, because it's the key to your server.
6. **Network settings → Edit:** **Create security group**, name `vaultwise-sg`, with three inbound rules: SSH from
   **My IP**, HTTP from anywhere, HTTPS from anywhere (step 7 explains them).
7. **Configure storage:** 20 GiB, `gp3`. Open **Advanced**, expand the volume and set **Encrypted** to *Encrypted*
   (the default key is fine). The privacy page says the server's disk is encrypted, and it can't be switched on later
   without copying the disk (step 16). To make every future disk encrypted, also turn on **EBS encryption** under
   **Data protection and security** in the EC2 dashboard's account attributes.
8. **Launch instance**, and wait until **Instance state** says *Running*.

### 6. Attach an Elastic IP (YOU ONLY)

A server's public address changes when it stops and starts, unless you fix it with an Elastic IP.

1. EC2 → **Network & Security → Elastic IPs → Allocate Elastic IP address → Allocate**.
2. Select the new address → **Actions → Associate Elastic IP address** → choose the `vaultwise` instance → **Associate**.

Write the address down: it's `YOUR-ELASTIC-IP`. AWS charges a small hourly fee for every public IPv4 address, so
**release** the Elastic IP if you ever delete the server (it keeps costing money while it's unattached).

### 7. Check the security group (YOU ONLY)

EC2 → the instance → **Security** tab → the `vaultwise-sg` group → **Edit inbound rules**. Make sure there are exactly
these:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP**, plus `13.233.177.0/29` if you log in with EC2 Instance Connect in the browser (AWS's address range for it in Mumbai) | You log in |
| HTTP | 80 | Anywhere-IPv4 and Anywhere-IPv6 | Caddy proves you own the domain and redirects to HTTPS |
| HTTPS | 443 | Anywhere-IPv4 and Anywhere-IPv6 | The website and the phone app |

The console shows a yellow warning when SSH is open to anywhere (`0.0.0.0/0`): that's a nudge to narrow it as above.
Your home address can change; if SSH stops working, update the **My IP** rule. Don't open port 3000: the app only
listens inside the server. Leave the outbound rules as they are (all traffic).

### 8. Point the domain at the server (YOU ONLY)

At your registrar's DNS settings, add a record:

| Type | Name / host | Value | TTL |
|---|---|---|---|
| `A` | `@` for the bare domain, or e.g. `app` for `app.yourname.in` | `YOUR-ELASTIC-IP` | 300 (or the lowest offered) |

At Hostinger it's **Domains → your domain → DNS / Nameservers → DNS records**. First delete any `A` or `AAAA` record for
`@` that points somewhere else (the registrar's parking page), or some visitors will land there.

Check it from your computer after a few minutes (it can take up to an hour):

```bash
nslookup vaultwise.example.com
```

It's ready when the answer shows `YOUR-ELASTIC-IP`.

### 9. Log in and install the software

Log in with the browser terminal (EC2 → the instance → **Connect** → **EC2 Instance Connect** → user `ubuntu` →
**Connect**), or from your computer:

```bash
ssh -i path/to/vaultwise.pem ubuntu@YOUR-ELASTIC-IP
```

(On a Mac or Linux, run `chmod 400 path/to/vaultwise.pem` once first.) Everything from here runs on the server. Paste
one block at a time.

**Update the system and add swap** (memory on disk, so the build doesn't run out on 2 GB):

```bash
sudo apt update && sudo apt -y upgrade
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Node.js 24** (the app needs it for its built-in SQLite):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node -v
```

`node -v` must print `v24` or later.

**Caddy** (HTTPS), from Caddy's official package source:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**sqlite3** (backups) and **git**:

```bash
sudo apt install -y sqlite3 git
```

### 10. Get the code

Create a user that only runs the app (it can't log in), and clone the repository as that user:

```bash
sudo useradd --system --create-home --home-dir /home/vaultwise --shell /usr/sbin/nologin vaultwise
sudo mkdir -p /opt/vaultwise && sudo chown vaultwise:vaultwise /opt/vaultwise
sudo -u vaultwise -H git clone https://github.com/YOUR-GITHUB-USER/VaultWise.git /opt/vaultwise
```

Replace `YOUR-GITHUB-USER/VaultWise` with the repository's address. **If the repository is private**, give the server a
read-only deploy key instead:

```bash
sudo -u vaultwise mkdir -p -m 700 /home/vaultwise/.ssh
sudo -u vaultwise -H ssh-keygen -t ed25519 -N "" -f /home/vaultwise/.ssh/id_ed25519
sudo cat /home/vaultwise/.ssh/id_ed25519.pub
```

On GitHub, open the repository → **Settings → Deploy keys → Add deploy key**, paste the line printed above, leave
*Allow write access* off, and save. Then clone with the SSH address:

```bash
sudo -u vaultwise -H git clone git@github.com:YOUR-GITHUB-USER/VaultWise.git /opt/vaultwise
```

(Answer `yes` when it asks to trust github.com.)

### 11. Write the settings file

```bash
sudo cp /opt/vaultwise/.env.example /etc/vaultwise.env
sudo chown root:vaultwise /etc/vaultwise.env && sudo chmod 640 /etc/vaultwise.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
sudo nano /etc/vaultwise.env
```

The `node -e` line prints a random value for `IDENTITY_SECRET`. In the editor, fill in these lines (no quotes, no spaces
around `=`). Save with **Ctrl+O, Enter**, quit with **Ctrl+X**.

| Variable | Value | Required |
|---|---|---|
| `NODE_ENV` | `production` (add this line, written exactly `NODE_ENV=production`) | yes |
| `TRUST_PROXY_HOPS` | `1` (remove the `#` in front of it). Caddy is the one proxy in front of the app and sets `X-Real-IP`, so rate limits see each visitor's real address. Without it the app ignores address headers (a visitor could fake them) and only limits per person | yes |
| `RATE_LIMIT_PER_MINUTE` | leave it out for the default, 120 requests a minute per person and per address. Photo uploads have their own limit (20 an hour per person) | optional |
| `FIREBASE_PROJECT_ID` | `projectId` from step 3. **Without it the server refuses to start**, because the app would be open to anyone | yes |
| `FIREBASE_WEB_API_KEY` | `apiKey` from step 3 (sends password-reset emails) | yes |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` from step 3 | yes |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` from step 3 (e.g. `your-project.firebaseapp.com`) | yes |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` from step 3 | yes |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` from step 3 | yes |
| `IDENTITY_SECRET` | the random value printed above. Never change it once IDs are saved, and treat it like a password | yes |
| `ADMIN_EMAILS` | reviewer emails, comma-separated, e.g. `you@gmail.com,friend@gmail.com` | yes |
| `GROQ_API_KEY` | the key from step 4, or leave blank for no AI | optional |
| `KYC_ENFORCED` | `false` while testers don't verify an ID (plan 05 keeps the ID check off for testers). Remove it to require ID checks | recommended |
| `OTP_MODE` | `twilio` with the three `TWILIO_` values (real SMS), or `test` plus `OTP_TEST_ALLOWED=true` for a demo server (the code is shown in the app instead of texted). **Blank turns texted codes off**: trusting a new phone, verifying a phone number and resetting a forgotten MPIN then answer "not available" | recommended |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | from the Twilio console, only with `OTP_MODE=twilio` | with twilio |

Don't set `VAULTWISE_DATA_DIR` here: the service sets it to `/var/lib/vaultwise`, where the database and photos live,
outside the code folder. (If you do set it, it must be exactly `/var/lib/vaultwise`.)

`NEXT_PUBLIC_` values end up in the web pages, so they aren't secret; everything else is. Never commit this file or
paste it into a chat.

**The contact address on the policy pages** is `CONTACT_EMAIL` in `src/components/legal/config.ts`, already set to the
team's inbox. To change it, change it in the repository and pull; don't edit the server's copy.

### 12. Install the service and scripts, build and start

```bash
sudo install -o root -g root -m 0644 /opt/vaultwise/deploy/vaultwise.service /etc/systemd/system/vaultwise.service
sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/update.sh /usr/local/sbin/vaultwise-update
sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/backup.sh /usr/local/sbin/vaultwise-backup
sudo systemctl daemon-reload
sudo systemctl enable vaultwise
sudo vaultwise-update --no-pull
```

`vaultwise-update` installs the packages, builds the app with your settings, starts it, and waits until it answers.
It ends with `Vaultwise is up`. If it doesn't, read the log:

```bash
journalctl -u vaultwise -n 50 --no-pager
```

A message starting `Vaultwise won't start: NODE_ENV is production but FIREBASE_PROJECT_ID is not set` means step 11
isn't finished. Lines starting `[vaultwise]` are warnings about other missing settings.

**Why root-owned copies.** `/opt/vaultwise` belongs to the `vaultwise` user, and the build runs every package's
install scripts as that user, so anything in that folder could have been changed by a package. Root must never run
a file from there: it runs only the copies in `/usr/local/sbin` (owned by root, writable only by root). The build
itself still runs as `vaultwise`, never as root.

### 13. Turn on HTTPS with Caddy

```bash
sudo cp /opt/vaultwise/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/vaultwise.example.com/YOUR-DOMAIN/' /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Replace `YOUR-DOMAIN` with your domain (just the name, e.g. `vaultwise.online`). Caddy gets a free certificate within a
minute. If it can't, check step 7 (ports 80 and 443 open in the security group) and step 8 (the domain points here):
`journalctl -u caddy -n 50 --no-pager`.

### 14. Check it from your computer

```bash
curl -I https://YOUR-DOMAIN
```

You should see `HTTP/2 200` and these headers: `strict-transport-security`, `x-content-type-options: nosniff`,
`x-frame-options: DENY`, `referrer-policy`, `permissions-policy` and `content-security-policy`.

```bash
curl -X POST https://YOUR-DOMAIN/api/v1/reset
```

This must answer `{"error":"Sign in to continue.","code":"signed_out"}` (status 401). If it answers `{"ok":true}`, sign-in
isn't on: stop the server (`sudo systemctl stop vaultwise`) and fix step 11.

Then in a browser: open `https://YOUR-DOMAIN`, create an account, make a vault, send a bill, and open
`https://YOUR-DOMAIN/admin` with a reviewer email from `ADMIN_EMAILS` to see it. (A reviewer who signed up before
verifying their email has to sign out and back in once.) Also open `/privacy`, `/terms` and `/delete-account` in a
private window (signed out): Google Play checks these links.

### 15. Updating later

When new code is pushed to the repository:

```bash
sudo vaultwise-update
```

It pulls, builds and restarts (the site is down for a few seconds). After changing `/etc/vaultwise.env`, run the same
command, because some settings are baked in at build time. A "failed to connect" line while it waits for the app to
start is normal; what counts is the last line, `Vaultwise is up`.

If the new code changed `deploy/update.sh`, `deploy/backup.sh` or `deploy/vaultwise.service`, it prints the
difference from the installed copy (lines starting `!!`) and the `sudo install ...` command for it, and keeps using
the installed copy. Read the difference: it should match a change you know about in the repository. Then run the
command it printed. Never copy them over without reading, and never run `sudo bash /opt/vaultwise/deploy/...`.

**Servers set up before this step was changed** (cron or you ran `/opt/vaultwise/deploy/*.sh` as root): read
`/opt/vaultwise/deploy/update.sh` and `backup.sh` first (`git -C /opt/vaultwise status` and `git -C /opt/vaultwise diff`
must show no local changes), then run the three `sudo install` lines from step 12 and the cron line from step 17.

---

## Part C. Keeping the data safe

### 16. Disk encryption and daily snapshots (YOU ONLY)

1. **Check the disk is encrypted.** EC2 → **Elastic Block Store → Volumes** → the `vaultwise` instance's volume:
   **Encryption** must say *Encrypted*. Record it with the date in gap 16 of `docs/security.md`. The privacy page says
   the server runs on an encrypted disk, so if it says *Not encrypted*, fix it or change the page. To fix it: take a
   fresh nightly backup (step 17), then on the instance choose **Actions → Image and templates → Create image**; when
   the image is ready, **copy** it with encryption turned on; launch a new instance from the copy (same type, key pair
   and security group); move the Elastic IP to it (step 6); check the site; then terminate the old instance.
2. **Turn on daily snapshots.** Tag the volume first: **Volumes** → the volume → **Tags → Manage tags → Add tag**,
   key `Backup`, value `daily`. Then **Elastic Block Store → Lifecycle Manager → Create lifecycle policy → EBS
   snapshot policy**: target resource type **Volume**, target tag `Backup` = `daily`, the default IAM role, a schedule
   of **daily, every 24 hours, starting 21:30 UTC** (03:00 IST), and retention by **count: 7** → **Create policy**.
   The first snapshot appears under **Snapshots** after the next scheduled time.

### 17. Nightly backups

`deploy/backup.sh` copies the database safely while the app runs, checks the copy, packs the photos and the audit
anchors (below) with it, and keeps 14 days of backups in `/var/backups/vaultwise`. Step 12 installed it as the root-owned `/usr/local/sbin/vaultwise-backup`;
cron runs that copy, never the one in `/opt/vaultwise`. Schedule it and run it once:

```bash
sudo mkdir -p /var/backups/vaultwise && sudo chmod 700 /var/backups/vaultwise
echo '30 21 * * * root /usr/local/sbin/vaultwise-backup >> /var/log/vaultwise-backup.log 2>&1' | sudo tee /etc/cron.d/vaultwise-backup
sudo vaultwise-backup
```

The server clock is UTC, so `30 21` runs at 03:00 IST. The last command should print `Backup OK`. Check it now and then:
`sudo tail /var/log/vaultwise-backup.log`.

**A second copy somewhere else.** These backups sit on the same server as the data. Pick one:

- **S3 (automatic).** **YOU ONLY:** in the AWS console create a private S3 bucket in `ap-south-1` with a lifecycle rule
  that deletes objects after 14 days, and an IAM user whose only permission is `s3:PutObject` on that bucket; create an
  access key for it. Then on the server:

  ```bash
  sudo snap install aws-cli --classic
  sudo aws configure   # paste the access key, the secret, and region ap-south-1
  sudo sed -i '1i BACKUP_S3_URI=s3://YOUR-BUCKET-NAME/vaultwise' /etc/cron.d/vaultwise-backup
  ```

  The bucket goes in the cron file as a setting, so neither copy of `backup.sh` is edited (an edited copy would show
  up as a difference on every update).

- **Download (by hand, weekly).** From your computer:

  ```bash
  ssh -i path/to/vaultwise.pem ubuntu@YOUR-ELASTIC-IP 'sudo bash -c "cd /var/backups/vaultwise && tar -cz \$(ls -1 | tail -n 1)"' > vaultwise-backup-$(date +%F).tar.gz
  ```

  The file holds personal data: keep it on an encrypted drive and delete copies older than 14 days.

**Audit anchors.** Every important action is written to a hash-chained audit log in the database, but someone who can
rewrite the database could rebuild the whole chain. So the app also writes the chain's head (the newest row's id and
hash, and the row count) as one line to `/var/lib/vaultwise/audit-anchors.jsonl` when it starts and once a day, and
the same line to its log, which the journal keeps (`journalctl -u vaultwise -o cat | grep audit_anchor`). The nightly
backup copies the file (to S3 too, when set up) and checks the newest anchor against the database copy: a mismatch
prints `AUDIT ANCHOR MISMATCH` in the backup log and the run fails.

The full check walks every hash again and compares the chain with every anchor. Run it as the app user, never as root,
once a month with the restore test and whenever the backup log shows a mismatch. It must end with `OK:`:

```bash
sudo -u vaultwise -H bash -c 'cd /opt/vaultwise && export VAULTWISE_DATA_DIR=/var/lib/vaultwise && set -a && . /etc/vaultwise.env && set +a && npm run audit:verify'
```

To check the journal's copy as well (only lines since the last restore, if there was one, will match):

```bash
sudo journalctl -u vaultwise -o cat --no-pager | grep audit_anchor | sudo tee /var/lib/vaultwise/journal-anchors.jsonl > /dev/null
sudo chown vaultwise:vaultwise /var/lib/vaultwise/journal-anchors.jsonl
sudo -u vaultwise -H bash -c 'cd /opt/vaultwise && VAULTWISE_DATA_DIR=/var/lib/vaultwise npm run audit:verify -- --anchors /var/lib/vaultwise/journal-anchors.jsonl'
sudo rm /var/lib/vaultwise/journal-anchors.jsonl
```

Optional: after the first start, `sudo chattr +a /var/lib/vaultwise/audit-anchors.jsonl` makes the file append-only,
even for the app (it only ever appends). Only root can undo that (`sudo chattr -a ...`), which a restore needs.

### 18. Test a restore

A backup you haven't restored is a hope, not a backup. Follow **Test a restore** in [restore.md](restore.md) now, and
then once a month. The same page explains a real restore and rebuilding the whole server from a snapshot.

### 19. Uptime check (YOU ONLY)

Create a free account at [UptimeRobot](https://uptimerobot.com/) (or Better Stack) and add a monitor:

- Type **HTTP(s)**, URL `https://YOUR-DOMAIN/api/v1/region`, every 5 minutes.
- Alert by email to you and your teammate.

It emails you when the site stops answering, and again when it's back. For the reason, look at
`journalctl -u vaultwise -n 100 --no-pager` on the server.

---

## Part D. The phone

### 20. The `tester-live` build (YOU ONLY: Expo account)

The `tester-live` profile in `mobile/eas.json` makes an Android APK that talks to this server, with sign-in on and Practice off.

1. In `mobile/eas.json`, the `tester-live` profile's `EXPO_PUBLIC_API_URL` is `https://vaultwise.online`. Change it
   only if you use another domain.
2. Give the build the Firebase web settings from step 3 (they're public by design), in the EAS `preview` environment
   that the profile uses. From `mobile/`:

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_FIREBASE_API_KEY --value YOUR-API-KEY
   npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value YOUR-PROJECT.firebaseapp.com
   npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value YOUR-PROJECT-ID
   npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_FIREBASE_APP_ID --value YOUR-APP-ID
   ```

3. Build it and share the link EAS prints with your testers:

   ```bash
   npx eas-cli@latest build --profile tester-live --platform android
   ```

4. Full check on a phone: sign up, make a vault, send a bill, and see it in the admin console on the website.
5. Later code and design changes reach installed tester apps over the air: `npm run update:tester-live -- "What changed"`.

---

## If something goes wrong

| Problem | What to do |
|---|---|
| The site is down | `sudo systemctl status vaultwise caddy --no-pager`, then `journalctl -u vaultwise -n 100 --no-pager` |
| `Vaultwise won't start ... FIREBASE_PROJECT_ID is not set` | Fill in `/etc/vaultwise.env` (step 11), then `sudo systemctl restart vaultwise` |
| `NODE_ENV: command not found` in the log | The first line of `/etc/vaultwise.env` isn't written `NODE_ENV=production`. Fix it, then `sudo systemctl restart vaultwise` |
| The service gave up after several failures | Fix the cause in the log, then `sudo systemctl reset-failed vaultwise && sudo systemctl start vaultwise` |
| The build stops with "killed" or "out of memory" | Check the swap from step 9 is on: `swapon --show` |
| No certificate / browser warning | Ports 80 and 443 open in the security group (step 7)? Domain points at the Elastic IP (step 8)? `journalctl -u caddy -n 50 --no-pager` |
| You can't SSH in any more | Your home address changed: update the **My IP** SSH rule (step 7), or use EC2 Instance Connect |
| Sign-in fails on the website | Your domain is in Firebase's **Authorised domains** (step 3), and the `NEXT_PUBLIC_FIREBASE_*` values are right. Rebuild after fixing them (step 15) |
| The admin console says it's for reviewers | The email isn't in `ADMIN_EMAILS`, or the sign-in predates verifying the email: sign out and back in |
| "Trust this phone" or a texted code says it's not available | `OTP_MODE` is blank. Set it (step 11) and run `sudo vaultwise-update` |
| Wrong or lost data | [restore.md](restore.md) |
| `AUDIT ANCHOR MISMATCH` in `/var/log/vaultwise-backup.log`, or `npm run audit:verify` fails | The audit log may have been changed. Don't restore or delete anything yet: keep the server, the backups, S3 and the journal as they are, and run the checker on older backups (`-- --db <backup>/vaultwise.db --anchors <backup>/audit-anchors.jsonl`) to find when it changed |

**Turning it off (rollback).** Point the tester build back at Practice with an over-the-air update, then stop the
server: `sudo systemctl stop vaultwise && sudo systemctl disable vaultwise`. The data stays in the snapshots and
backups. To stop paying, terminate the instance, delete its snapshots and the Lifecycle Manager policy, and **release**
the Elastic IP (keep a downloaded backup first if you need the data, and remember the privacy policy promises to delete
it when the project ends).

## Files in this folder

| File | What it is | Installed as |
|---|---|---|
| `Caddyfile` | HTTPS reverse proxy to the app on `127.0.0.1:3000` | `/etc/caddy/Caddyfile` |
| `vaultwise.service` | Runs `npm start` as the `vaultwise` user, with `/etc/vaultwise.env` and `VAULTWISE_DATA_DIR=/var/lib/vaultwise` | `/etc/systemd/system/vaultwise.service` (root, 0644) |
| `update.sh` | Pull and build as `vaultwise`, restart, wait until it answers; shows changes to the installed deploy files | `/usr/local/sbin/vaultwise-update` (root, 0755), run with `sudo` |
| `backup.sh` | Nightly database, photo and audit-anchor backup with an anchor check, keeps 14 days, optional S3 copy (`BACKUP_S3_URI`) | `/usr/local/sbin/vaultwise-backup` (root, 0755), run by `/etc/cron.d/vaultwise-backup` |
| `restore.md` | Testing a restore, restoring the app, rebuilding the server from a snapshot | |

Root only ever runs the installed, root-owned copies. The files in `/opt/vaultwise/deploy` are the source you read and
install from (step 15), never something root runs.
