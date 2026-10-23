import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}

function int(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
  },
  twitch: {
    clientId: required('TWITCH_CLIENT_ID'),
    clientSecret: required('TWITCH_CLIENT_SECRET'),
  },
  rcon: {
    host: process.env.RCON_HOST?.trim() || '127.0.0.1',
    port: int('RCON_PORT', 25575),
    password: required('RCON_PASSWORD'),
  },
  checkIntervalSeconds: int('CHECK_INTERVAL_SECONDS', 60),
  // dotenv keeps leading whitespace in unquoted values, but be defensive about it.
  liveSuffix: process.env.LIVE_SUFFIX ?? ' &c🎥',
  suffixPriority: int('SUFFIX_PRIORITY', 100),
  announceLive: (process.env.ANNOUNCE_LIVE ?? 'true').trim().toLowerCase() !== 'false',
};
