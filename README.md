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

## 4. Run the bot

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
# edit .env and fill in the values
npm start
```

On start the bot registers `/link` and `/unlink` in your guild (instantly available) and begins polling Twitch.
State is stored in `data.sqlite` next to where you start the bot (override with `DB_PATH`).
`better-sqlite3` ships prebuilt binaries for current Node LTS versions; if `npm install` has to compile it,
you need a C++ toolchain installed.

To keep it running, use a process manager such as `pm2 start src/index.js --name mc-live-badge`.

## Commands

| Command | Description |
| --- | --- |
| `/link twitch:<name> minecraft:<name>` | Validates both accounts, stores the link, replies with an embed showing the player's skin bust. Running it again updates your link. |
| `/unlink` | Deletes your link and removes the badge. If the player is currently live and the Minecraft server can't be reached, the link is kept so you can retry. |

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
