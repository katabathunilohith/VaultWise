# Putting Vaultwise online

> A step-by-step guide for someone who has never set up a server. It follows [plan 05](../docs/plans/05-server-online.md):
> one small AWS Lightsail server in Mumbai runs the Vaultwise server and its SQLite database, Caddy gives it HTTPS,
> and backups run every night. Money stays pretend; this only makes accounts real.

**Time:** about two hours the first time. **Cost:** about US$12 a month for the server (check the price Lightsail shows for
Mumbai when you pick the plan; new AWS accounts sometimes get the first months free), a few cents a month for snapshots,
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
| 5 to 7 | Create the server, static IP, firewall | **YOU ONLY** (in your AWS account) |
| 8 | Point the domain at the server | **YOU ONLY** (at your domain registrar) |
| 9 to 15 | Install, configure, start, HTTPS, checks | Anyone |
| 16 | Automatic snapshots | **YOU ONLY** (AWS console) |
| 17 | Nightly backups (and optional S3 copy) | Anyone (S3 bucket: **YOU ONLY**) |
| 18 | Test a restore | Anyone |
| 19 | Uptime check | **YOU ONLY** (free account) |
| 20 | Phone `tester-live` build | **YOU ONLY** (Expo account) |

Wherever you see `vaultwise.example.com`, use your own domain (for example `app.yourname.in`), and wherever you see
`YOUR-STATIC-IP`, use the address from step 6.

---

## Part A. Accounts (YOU ONLY)

### 1. AWS account

1. Sign up at [aws.amazon.com](https://aws.amazon.com/). You need a payment card; India cards work.
2. Turn on multi-factor authentication for the root user: top-right menu → **Security credentials** → **Assign MFA device**.
3. Optional but wise: in **Billing → Budgets**, create a monthly budget of US$20 that emails you, so a surprise bill can't happen.

### 2. A domain

Buy a domain from any registrar (GoDaddy, Namecheap, Cloudflare, Hostinger, BigRock...). A subdomain of a domain you
already own works too, for example `vaultwise.yourname.in`.

Use a name you only use for Vaultwise: the server tells browsers to use HTTPS for it (and its subdomains) for two years.

### 3. Firebase project (sign-in)

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) → **Add project**. Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Authentication → Settings → Authorised domains → Add domain**: your domain from step 2.
4. **Project settings** (gear icon) **→ General → Your apps → Web (`</>`)**: register an app called "Vaultwise web".
   Keep the page open; you'll copy `apiKey`, `authDomain`, `projectId` and `appId` from the config it shows in step 9.
5. Decide who reviews bills and IDs. Each reviewer signs up on the website later with that email and verifies it.

### 4. Groq API key (optional)

The AI reads bills and IDs (only for people who agree) and powers the assistant. Without a key, a person reviews every
bill and the assistant is off. Create a key at [console.groq.com/keys](https://console.groq.com/keys).

---

## Part B. The server

### 5. Create the Lightsail instance (YOU ONLY)

1. Open [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com/) → **Create instance**.
2. **Region:** Mumbai, `ap-south-1` (zone A is fine).
3. **Platform:** Linux/Unix. **Blueprint:** *OS Only* → the newest **Ubuntu LTS** (24.04 or later).
4. **SSH key:** keep the default key, and download it (**Download default key**). Store the `.pem` file safely; it's the
   key to your server.
5. **Plan:** the one with **2 GB** memory. Check the monthly price shown.
6. **Name:** `vaultwise`. Tick **Enable automatic snapshots** if offered (otherwise step 16 does it).
7. **Create instance** and wait until it says *Running*.

### 6. Attach a static IP (YOU ONLY)

The server's address changes when it restarts unless you fix it. Open the instance → **Networking** →
**Attach static IP** (or **Create static IP**, choose the instance, name it `vaultwise-ip`). Write the address down: it's
`YOUR-STATIC-IP`. A static IP is free while it's attached.

### 7. Open the firewall (YOU ONLY)

Instance → **Networking** → **IPv4 firewall**. Make sure there are exactly these rules:

| Application | Port | Why |
|---|---|---|
| SSH | 22 | You log in (you can restrict it to your own IP with **Restrict to IP address**) |
| HTTP | 80 | Caddy proves you own the domain and redirects to HTTPS |
| HTTPS | 443 | The website and the phone app |

Do the same under **IPv6 firewall** (or delete its rules if you don't use IPv6). Don't open port 3000: the app only
listens inside the server.

### 8. Point the domain at the server (YOU ONLY)

At your registrar's DNS settings, add a record:

| Type | Name / host | Value | TTL |
|---|---|---|---|
| `A` | `@` for the bare domain, or e.g. `app` for `app.yourname.in` | `YOUR-STATIC-IP` | 300 (or the lowest offered) |

Check it from your computer after a few minutes (it can take up to an hour):

```bash
nslookup vaultwise.example.com
```

It's ready when the answer shows `YOUR-STATIC-IP`.

### 9. Log in and install the software

Log in with the browser terminal (instance → **Connect using SSH**), or from your computer:

```bash
ssh -i path/to/LightsailDefaultKey-ap-south-1.pem ubuntu@YOUR-STATIC-IP
```

Everything from here runs on the server. Paste one block at a time.

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
| `NODE_ENV` | `production` (add this line) | yes |
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

**Before you build, put the real contact address in the policy pages:** edit
`/opt/vaultwise/src/components/legal/config.ts` (or better, change it in the repository and pull) and replace
`privacy@<your-domain>` with an inbox the team reads.

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

Replace `YOUR-DOMAIN` with your domain (just the name, e.g. `app.yourname.in`). Caddy gets a free certificate within a
minute. If it can't, check step 7 (ports 80 and 443) and step 8 (the domain points here):
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
`https://YOUR-DOMAIN/admin` with a reviewer email from `ADMIN_EMAILS` to see it. Also open `/privacy`, `/terms` and
`/delete-account` in a private window (signed out): Google Play checks these links.

### 15. Updating later

When new code is pushed to the repository:

```bash
sudo vaultwise-update
```

It pulls, builds and restarts (the site is down for a few seconds). After changing `/etc/vaultwise.env`, run the same
command, because some settings are baked in at build time.

If the new code changed `deploy/update.sh`, `deploy/backup.sh` or `deploy/vaultwise.service`, it prints the
difference from the installed copy (lines starting `!!`) and the `sudo install ...` command for it, and keeps using
the installed copy. Read the difference: it should match a change you know about in the repository. Then run the
command it printed. Never copy them over without reading, and never run `sudo bash /opt/vaultwise/deploy/...`.

**Servers set up before this step was changed** (cron or you ran `/opt/vaultwise/deploy/*.sh` as root): read
`/opt/vaultwise/deploy/update.sh` and `backup.sh` first (`git -C /opt/vaultwise status` and `git -C /opt/vaultwise diff`
must show no local changes), then run the three `sudo install` lines from step 12 and the cron line from step 17.

---

## Part C. Keeping the data safe

### 16. Automatic snapshots and disk encryption (YOU ONLY)

1. Lightsail → the instance → **Snapshots** → **Automatic snapshots** → **Enable**, and pick a time, e.g. 03:00 IST.
   Lightsail keeps the last 7 daily snapshots of the whole disk.
2. Lightsail encrypts instance disks and snapshots at rest. Check that the
   [Lightsail FAQ](https://aws.amazon.com/lightsail/faq/) still says so, and record it with the date in the project's
   security notes (gap 16 in `docs/security.md`).

### 17. Nightly backups

`deploy/backup.sh` copies the database safely while the app runs, checks the copy, packs the photos with it, and keeps
14 days of backups in `/var/backups/vaultwise`. Step 12 installed it as the root-owned `/usr/local/sbin/vaultwise-backup`;
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
  ssh -i path/to/key.pem ubuntu@YOUR-STATIC-IP 'sudo bash -c "cd /var/backups/vaultwise && tar -cz \$(ls -1 | tail -n 1)"' > vaultwise-backup-$(date +%F).tar.gz
  ```

  The file holds personal data: keep it on an encrypted drive and delete copies older than 14 days.

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

1. In `mobile/eas.json`, replace `https://YOUR-DOMAIN` in the `tester-live` profile with your domain, and commit it.
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

---

## If something goes wrong

| Problem | What to do |
|---|---|
| The site is down | `sudo systemctl status vaultwise caddy --no-pager`, then `journalctl -u vaultwise -n 100 --no-pager` |
| `Vaultwise won't start ... FIREBASE_PROJECT_ID is not set` | Fill in `/etc/vaultwise.env` (step 11), then `sudo systemctl restart vaultwise` |
| The service gave up after several failures | Fix the cause in the log, then `sudo systemctl reset-failed vaultwise && sudo systemctl start vaultwise` |
| The build stops with "killed" or "out of memory" | Check the swap from step 9 is on: `swapon --show` |
| No certificate / browser warning | Ports 80 and 443 open (step 7)? Domain points here (step 8)? `journalctl -u caddy -n 50 --no-pager` |
| Sign-in fails on the website | Your domain is in Firebase's **Authorised domains** (step 3), and the `NEXT_PUBLIC_FIREBASE_*` values are right. Rebuild after fixing them (step 15) |
| Wrong or lost data | [restore.md](restore.md) |

**Turning it off (rollback).** Point the tester build back at Practice with an over-the-air update, then stop the
server: `sudo systemctl stop vaultwise && sudo systemctl disable vaultwise`. The data stays in the snapshots and
backups. To stop paying, delete the instance, its snapshots and the static IP in Lightsail (keep a downloaded backup
first if you need the data, and remember the privacy policy promises to delete it when the project ends).

## Files in this folder

| File | What it is | Installed as |
|---|---|---|
| `Caddyfile` | HTTPS reverse proxy to the app on `127.0.0.1:3000` | `/etc/caddy/Caddyfile` |
| `vaultwise.service` | Runs `npm start` as the `vaultwise` user, with `/etc/vaultwise.env` and `VAULTWISE_DATA_DIR=/var/lib/vaultwise` | `/etc/systemd/system/vaultwise.service` (root, 0644) |
| `update.sh` | Pull and build as `vaultwise`, restart, wait until it answers; shows changes to the installed deploy files | `/usr/local/sbin/vaultwise-update` (root, 0755), run with `sudo` |
| `backup.sh` | Nightly database and photo backup, keeps 14 days, optional S3 copy (`BACKUP_S3_URI`) | `/usr/local/sbin/vaultwise-backup` (root, 0755), run by `/etc/cron.d/vaultwise-backup` |

Root only ever runs the installed, root-owned copies. The files in `/opt/vaultwise/deploy` are the source you read and
install from (step 15), never something root runs.
| `restore.md` | Testing a restore, restoring the app, rebuilding from a snapshot | |
