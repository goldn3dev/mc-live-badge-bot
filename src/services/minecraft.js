import { config } from '../config.js';

const TIMEOUT_MS = 5_000;

/** False until both MC_HTTP_URL and MC_SECRET_TOKEN are set; callers skip Minecraft work meanwhile. */
export const isConfigured = () => config.minecraft.configured;

/**
 * POST a status update to the TwitchTabBadge plugin.
 * Rejects on network failure, timeout or any non-200 response; callers decide whether that is fatal.
 */
async function post(body) {
  if (!isConfigured()) throw new Error('Minecraft sync is not configured (MC_HTTP_URL / MC_SECRET_TOKEN)');

  let res;
  try {
    res = await fetch(config.minecraft.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.minecraft.secretToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : (err.cause?.code ?? err.message);
    throw new Error(`Minecraft server unreachable (${reason})`);
  }

  if (res.status !== 200) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Minecraft server responded HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}

/** Show the live badge (and have the plugin announce it) for this player. */
export async function setLive(mcUuid, twitchLogin) {
  await post({ uuid: mcUuid, live: true, channel: twitchLogin });
}

/** Remove the live badge from this player. */
export async function setOffline(mcUuid) {
  await post({ uuid: mcUuid, live: false });
}
