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

/** Like a required URL, but a missing/invalid value is a warning rather than a crash. */
function optionalHttpUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    // fall through to the warning
  }
  console.warn(`[Config] ${name} is not a valid http(s) URL ("${raw}"); ignoring it.`);
  return null;
}

const mcUrl = optionalHttpUrl('MC_HTTP_URL');
const mcToken = process.env.MC_SECRET_TOKEN?.trim() || null;
const mcConfigured = Boolean(mcUrl && mcToken);
if (!mcConfigured) {
  console.warn('[Config] MC_HTTP_URL or MC_SECRET_TOKEN not configured yet. Minecraft sync will be skipped until set.');
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
  minecraft: {
    url: mcUrl,
    secretToken: mcToken,
    configured: mcConfigured,
  },
  database: {
    // A remote libSQL/Turso URL (libsql://...) takes priority over the local file.
    url: process.env.DATABASE_URL?.trim() || null,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
    path: process.env.DATABASE_PATH?.trim() || './data.sqlite',
  },
  port: int('PORT', 10000),
  checkIntervalSeconds: int('CHECK_INTERVAL_SECONDS', 60),
};
