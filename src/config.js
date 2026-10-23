import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}

function httpUrl(name) {
  const value = required(name);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be a full URL, got "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Environment variable ${name} must be an http(s) URL, got "${value}"`);
  }
  return url.toString();
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
  minecraft: {
    url: httpUrl('MC_HTTP_URL'),
    secretToken: required('MC_SECRET_TOKEN'),
  },
  checkIntervalSeconds: int('CHECK_INTERVAL_SECONDS', 60),
};
