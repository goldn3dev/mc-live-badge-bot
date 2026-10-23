# Minecraft Live Badge Bot

A Discord bot that links a member's Minecraft account to their Twitch channel. While they stream, the bot
gives them a LuckPerms suffix (default ` 🎥` in red) over RCON and announces it in-game; when the stream
ends, the suffix is removed.

```
/link twitch:<name> minecraft:<name>   -> saves the mapping (Mojang + Twitch lookups)
every CHECK_INTERVAL_SECONDS           -> Twitch Helix /streams -> RCON `lp user <uuid> meta setsuffix|removesuffix`
/unlink                                -> deletes the mapping and clears the suffix
```

## Requirements

- Node.js 20 or newer
- A Minecraft **Java** server (online mode) with [LuckPerms](https://luckperms.net/) and RCON enabled
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

## 3. Configure the Minecraft server

In `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=use-a-long-random-password
online-mode=true
broadcast-rcon-to-ops=false
```

Restart the server after changing these. Then:

- **Never expose the RCON port to the internet.** Firewall it so only the machine running the bot can connect
  (ideally run the bot on the same host and set `RCON_HOST=127.0.0.1`).
- `online-mode=true` is required: the bot uses real Mojang UUIDs, and cracked/offline servers generate
  different UUIDs, so LuckPerms would not find the player.
- `broadcast-rcon-to-ops=false` stops every RCON command from being echoed to online operators.

### LuckPerms

No setup beyond having LuckPerms installed. The bot runs, for a live player:

```
lp user <uuid> meta setsuffix 100 " &c🎥"
tellraw @a [{"text":"[LIVE] ","color":"red","bold":true},{"text":"<player>","color":"yellow"},{"text":" is streaming on Twitch! twitch.tv/<channel>","color":"gray"}]
```

and when they go offline:

```
lp user <uuid> meta removesuffix 100
```

For the badge to be *visible* your chat/tab/nametag plugin must display the LuckPerms suffix, e.g.
`%luckperms_suffix%` through PlaceholderAPI, or `{suffix}` in EssentialsX chat format
(`format: '{PREFIX}{DISPLAYNAME}{SUFFIX}: {MESSAGE}'` in Essentials `config.yml`).

Notes:

- Priority `100` is chosen so the badge doesn't collide with other suffixes; change it with `SUFFIX_PRIORITY`
  (the same value is used for removal).
- The player must have joined the server at least once, otherwise LuckPerms has no record of their UUID.
- The vanilla Minecraft font can't draw `🎥`. If it shows as a box, set `LIVE_SUFFIX` to something vanilla can
  render (e.g. `LIVE_SUFFIX= &c[LIVE]` or ` &c●`) or use a resource pack with a custom glyph.
- Set `ANNOUNCE_LIVE=false` to skip the `[LIVE]` chat broadcast.

## 4. Run the bot

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
# edit .env and fill in the values
npm start
```

On start the bot registers `/link` and `/unlink` in your guild (instantly available), connects to RCON, and
begins polling Twitch. State is stored in `data.sqlite` next to where you start the bot (override with `DB_PATH`).
`better-sqlite3` ships prebuilt binaries for current Node LTS versions; if `npm install` has to compile it,
you need a C++ toolchain installed.

To keep it running, use a process manager such as `pm2 start src/index.js --name mc-live-badge`.

## Commands

| Command | Description |
| --- | --- |
| `/link twitch:<name> minecraft:<name>` | Validates both accounts, stores the link, replies with an embed showing the player's skin bust. Running it again updates your link. |
| `/unlink` | Deletes your link and removes the LuckPerms suffix. If the player is currently live and the Minecraft server can't be reached, the link is kept so you can retry. |

## How resilience works

- **Twitch outage / rate limit:** the whole polling cycle is skipped, so nobody is wrongly flipped to offline.
- **RCON down:** the connection retries with backoff (2s up to 60s) in the background, and each command retries
  once on a fresh connection. If a badge change fails, the database flag is not updated, so it is retried on the
  next cycle (including after a server restart: the bot re-applies the badge to anyone still live).
- **Mojang/Twitch down during `/link`:** the user gets a friendly "try again" message; nothing is saved.
- **Invalid names:** rejected up front with a clear message.

## Limitations

- `/link` does not verify that you *own* the Minecraft or Twitch account; anyone in the guild can claim any
  account that isn't already claimed. A given Minecraft account or Twitch channel can only be linked to one
  Discord user. If this matters for your community, restrict who can use `/link` in
  *Server Settings -> Integrations -> your bot*, or add a verification step.
- A badge applied while the bot is down will stay until the bot is back and sees the stream has ended.
