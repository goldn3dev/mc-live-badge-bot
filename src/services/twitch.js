import { config } from '../config.js';
import { UserError } from '../errors.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX = 'https://api.twitch.tv/helix';
const TWITCH_LOGIN_RE = /^[A-Za-z0-9_]{1,25}$/;
const STREAMS_BATCH = 100; // Helix limit for repeated user_id params
const REFRESH_MARGIN_MS = 60_000;

let token = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

async function fetchToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Twitch token request failed with HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  token = body.access_token;
  tokenExpiresAt = Date.now() + body.expires_in * 1000 - REFRESH_MARGIN_MS;
  console.log('[twitch] obtained app access token');
  return token;
}

/** Returns a valid app access token, refreshing when missing/expired. Concurrent callers share one request. */
async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExpiresAt) return token;
  tokenPromise ??= fetchToken().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

async function helix(path, params) {
  const url = `${HELIX}${path}?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.twitch.clientId,
        Authorization: `Bearer ${await getToken(attempt > 0)}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    // Token revoked/expired early: refresh once and retry.
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) {
      throw new Error(`Twitch ${path} failed with HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()).data;
  }
  throw new Error(`Twitch ${path} was unauthorized even after refreshing the token`);
}

/**
 * Resolve a Twitch login to { id, login, displayName }.
 * Throws UserError for invalid/unknown channels and API failures.
 */
export async function lookupTwitchUser(login) {
  const clean = login.trim().replace(/^@/, '');
  if (!TWITCH_LOGIN_RE.test(clean)) {
    throw new UserError('That is not a valid Twitch username.');
  }
  let data;
  try {
    data = await helix('/users', new URLSearchParams({ login: clean.toLowerCase() }));
  } catch (err) {
    console.error('[twitch] user lookup failed:', err.message);
    throw new UserError('Could not reach the Twitch API right now. Please try again in a minute.');
  }
  const user = data?.[0];
  if (!user) throw new UserError(`No Twitch channel named \`${clean}\` exists.`);
  return { id: user.id, login: user.login, displayName: user.display_name };
}

/**
 * Of the given Twitch user ids, return the Set of those currently live.
 * Throws on any API failure so the caller can skip the cycle rather than
 * treating an outage as "everyone went offline".
 */
export async function getLiveUserIds(userIds) {
  const live = new Set();
  for (let i = 0; i < userIds.length; i += STREAMS_BATCH) {
    const params = new URLSearchParams({ first: String(STREAMS_BATCH) });
    for (const id of userIds.slice(i, i + STREAMS_BATCH)) params.append('user_id', id);
    const streams = await helix('/streams', params);
    for (const s of streams) {
      if (s.type === 'live') live.add(s.user_id);
    }
  }
  return live;
}
