# Minecraft Live Badge Bot

A Discord bot that links a member's Minecraft account to their Twitch channel. While they stream, the bot tells
the **TwitchTabBadge** Paper plugin over HTTP to show a 🎥 badge in the tab list / above their head and announce
it in chat; when the stream ends, the badge is removed.

```
/link twitch:<name> minecraft:<name>   -> saves the mapping (Mojang + Twitch lookups)
every CHECK_INTERVAL_SECONDS           -> Twitch Helix /streams -> POST MC_HTTP_URL {"uuid", "live", "channel"}
/unlink                                -> deletes the mapping and clears the badge
```

## Requirements

- Node.js 20 or newer
- A Paper server running the TwitchTabBadge plugin (source in `TwitchTabBadge/`, not tracked by this repo)
- A Discord application with a bot user
- A Twitch application (client ID + secret)

## 1. Create the Discord bot

1. <https://discord.com/developers/applications> -> **New Application**.
2. **Bot** tab -> **Reset Token** -> copy it to `DISCORD_TOKEN`. No privileged intents are needed.
3. Copy the **Application ID** from *General Information* to `DISCORD_CLIENT_ID`.
4. Invite the bot with this URL (replace `CLIENT_ID`):
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=0`
5. In Discord, enable Developer Mode, right-click your server -> **Copy Server ID** -> `DISCORD_GUILD_ID`.

## 2. Create the Twitch application

1. <https://dev.twitch.tv/console/apps> -> **Register Your Application**.
2. Set any OAuth Redirect URL (e.g. `http://localhost`), category *Application Integration*.
3. Copy the **Client ID** to `TWITCH_CLIENT_ID` and generate a **Client Secret** for `TWITCH_CLIENT_SECRET`.

The bot uses the client-credentials flow, so no user login is involved. The app token is refreshed automatically.

## 3. Connect to the Minecraft plugin

Start the server once with TwitchTabBadge installed; it writes `plugins/TwitchTabBadge/config.yml` with a random
`http.secret-token`. Then set in the bot's `.env`:

```env
MC_HTTP_URL=http://127.0.0.1:25585/api/status
MC_SECRET_TOKEN=<the http.secret-token value>
```

- The URL host/port must match the plugin's `http.bind-address` and `http.port` (default `127.0.0.1:25585`).
  If the bot runs on a different machine, set `bind-address` to `0.0.0.0` and **firewall the port** so only the
  bot's host can reach it.
- Requests are `POST` with `Authorization: Bearer <MC_SECRET_TOKEN>` and a JSON body:
  `{"uuid": "<dashed uuid>", "live": true, "channel": "<twitch login>"}` to go live, or
  `{"uuid": "<dashed uuid>", "live": false}` to go offline. The plugin answers `200` on success.
- The badge look and the chat announcement are configured in the plugin's `config.yml` (`badge:` and
  `broadcast:`), not in the bot.
- The server must be in online mode, since the bot sends real Mojang UUIDs.
- `MC_HTTP_URL` and `MC_SECRET_TOKEN` are optional at startup. If either is missing the bot still boots (Discord
  and the health check work, `/link` works) but logs `[Config] ... Minecraft sync will be skipped until set.` and
  does not poll Twitch. Set both and restart to enable syncing.

## 4. Run the bot

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
# edit .env and fill in the values
npm start
```

On start the bot opens a health-check HTTP server on `$PORT` (default 10000, bound to `0.0.0.0`; any `GET` returns
`200 OK`), registers `/link` and `/unlink` in your guild (instantly available) and begins polling Twitch.

### Database

- **Default:** a local SQLite file at `DATABASE_PATH` (default `./data.sqlite`). The directory is created if missing and
  the full path is logged at startup. Good for your own machine or a host with a persistent disk.
- **Hosted / no persistent disk:** set `DATABASE_URL` (and `DATABASE_AUTH_TOKEN`) to a libSQL database such as a free
  [Turso](https://turso.tech) one. `DATABASE_URL` takes priority over `DATABASE_PATH`. The same table is created
  automatically. Use this on hosts without a persistent disk.

To keep it running on your own machine, use a process manager such as `pm2 start src/index.js --name mc-live-badge`.

## Deploying on a free Google Cloud VM (recommended for hosting)

Google Cloud's Always Free tier includes one `e2-micro` VM (1 GB RAM, 30 GB disk). That is plenty for this bot, the
disk is permanent (so the default `data.sqlite` keeps your links across restarts), and no Turso database is needed.
Render's free web service is **not** recommended: Discord's Cloudflare protection rate-limits Render's shared IP
addresses (the startup `[probe]` line shows `HTTP 429`), so the bot can never log in.

> **Cost check.** The VM and disk are free within the limits (region must be `us-west1`, `us-central1` or `us-east1`;
> the disk must be a *Standard persistent disk*; 1 GB/month of outbound traffic, which this bot will not approach).
> Google does, however, charge `$0.005/hour` (about $3.70/month) for a VM's external IPv4 address, and its pricing page
> lists no exemption for the free-tier VM. Check *Billing -> Reports* after a day or two. A Google AI Pro plan includes
> $10/month of Google Cloud credits; look under *Billing -> Credits* to see whether they are attached to your billing
> account. Set a budget alert (*Billing -> Budgets & alerts*) at $1 so nothing surprises you.

### 1. Create the VM

In the [Cloud Console](https://console.cloud.google.com/) go to **Compute Engine -> VM instances -> Create instance**
(enable the Compute Engine API and attach a billing account if asked) and set:

- **Name:** `mc-live-badge`
- **Region:** `us-west1`, `us-central1` or `us-east1` (any zone)
- **Machine type:** `E2` -> `e2-micro`
- **Boot disk:** Debian 12 (or Ubuntu 24.04 LTS), size 30 GB, disk type **Standard persistent disk** (the default
  "Balanced" type is not free)
- **Firewall:** leave HTTP and HTTPS **unchecked**. The bot only makes outbound connections and needs no open ports.

Click **Create**, then use the **SSH** button next to the VM to open a terminal in your browser.

### 2. Add swap (1 GB RAM is tight for `npm install`)

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3. Install Node.js and git

```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 4. Get the bot onto the VM

If the repository is private, create a GitHub token first: *GitHub -> Settings -> Developer settings -> Fine-grained
tokens*, access to only this repository, permission **Contents: Read-only**. Then:

```bash
git config --global credential.helper store
git clone https://github.com/<your-user>/mc-twitch-bot.git
```

When prompted, the username is your GitHub username and the password is the token. It is remembered for later
`git pull`s.

### 5. Configure

```bash
cd mc-twitch-bot
npm install --omit=dev
cp .env.example .env
nano .env          # fill in the values, Ctrl+O Enter to save, Ctrl+X to exit
```

Leave `DATABASE_URL` commented out so the bot uses the local `data.sqlite`. `MC_HTTP_URL` must be your Minecraft
server's public address (see "Connect to the Minecraft plugin" above). Run `node src/index.js` once to check it works:
you should see `[discord] logged in as ...`. Stop it with Ctrl+C.

### 6. Keep it running (pick one)

**pm2:**

```bash
sudo npm install -g pm2
pm2 start src/index.js --name mc-live-badge
pm2 save
pm2 startup        # prints a command starting with "sudo env PATH=..."; copy and run it, then run: pm2 save
pm2 logs mc-live-badge
```

**or systemd:** create `/etc/systemd/system/mc-live-badge.service` (replace `YOURUSER` with the output of `whoami`):

```ini
[Unit]
Description=Minecraft live badge bot
After=network-online.target
Wants=network-online.target

[Service]
User=YOURUSER
WorkingDirectory=/home/YOURUSER/mc-twitch-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mc-live-badge
journalctl -u mc-live-badge -f
```

Either way the bot restarts after crashes and VM reboots. If you used Render before, suspend that service so two
copies of the bot are not answering commands.

### 7. Updating

```bash
cd ~/mc-twitch-bot
git pull
npm install --omit=dev
pm2 restart mc-live-badge          # or: sudo systemctl restart mc-live-badge
```

### Troubleshooting

- **`[probe] ... HTTP 429` in the logs:** Discord is throttling the VM's IP. Stop and start the VM (the external IP
  changes) and check again.
- **Your links:** they live in `~/mc-twitch-bot/data.sqlite` on the VM's disk. Do not delete the VM without copying it
  first (`cp data.sqlite ~/data.sqlite.bak` or download it from the SSH window).

## Commands

| Command | Description |
| --- | --- |
| `/link twitch:<name> minecraft:<name>` | Validates both accounts, stores the link, replies with an embed showing the player's skin bust. Running it again updates your link. |
| `/unlink` | Deletes your link and removes the badge. If the player is currently live and the Minecraft server can't be reached, the link is kept so you can retry. |
| `/sendlinkpanel` | Administrators only. Posts an embed with a **Link Account** button in the current channel. Members click it, fill in a Minecraft name and Twitch name in a pop-up form, and are linked with the same checks as `/link`. The button keeps working after bot restarts. The bot needs **View Channel**, **Send Messages** and **Embed Links** in that channel. |

## How resilience works

- **Twitch outage / rate limit:** the whole polling cycle is skipped, so nobody is wrongly flipped to offline.
- **Minecraft server down or plugin returns non-200:** the error is logged and the database flag is not updated,
  so the change is retried on the next cycle (this also re-applies badges after a server restart, as long as the
  streamer is still live).
- **Mojang/Twitch down during `/link`:** the user gets a friendly "try again" message; nothing is saved.
- **Invalid names:** rejected up front with a clear message.

## Limitations

- `/link` does not verify that you *own* the Minecraft or Twitch account; anyone in the guild can claim any
  account that isn't already claimed. A given Minecraft account or Twitch channel can only be linked to one
  Discord user. If this matters for your community, restrict who can use `/link` in
  *Server Settings -> Integrations -> your bot*, or add a verification step.
- If the bot is stopped while someone is live, their badge stays until the bot is back and sees the stream ended.
