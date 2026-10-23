import { config } from './config.js';
import { getAllStreamers, setLiveFlag } from './database.js';
import * as minecraft from './services/minecraft.js';
import { getLiveUserIds } from './services/twitch.js';

let timer = null;
let stopped = false;

/** One polling pass. Twitch/Minecraft failures are handled here; the caller guards against anything else. */
export async function checkOnce() {
  // Without a Minecraft endpoint there is nothing to sync; leave the DB flags untouched.
  if (!minecraft.isConfigured()) return;

  const streamers = await getAllStreamers();
  if (streamers.length === 0) return;

  let liveIds;
  try {
    liveIds = await getLiveUserIds([...new Set(streamers.map((s) => s.twitch_id))]);
  } catch (err) {
    // Don't flip anyone offline because Twitch hiccuped; try again next cycle.
    console.error('[scheduler] Twitch check failed, skipping this cycle:', err.message);
    return;
  }

  for (const s of streamers) {
    const isLive = liveIds.has(s.twitch_id);
    try {
      if (isLive && !s.is_live) {
        await minecraft.setLive(s.mc_uuid, s.twitch_login);
        await setLiveFlag(s.discord_id, true);
        console.log(`[scheduler] ${s.mc_username} went LIVE (twitch/${s.twitch_login})`);
      } else if (!isLive && s.is_live) {
        await minecraft.setOffline(s.mc_uuid);
        await setLiveFlag(s.discord_id, false);
        console.log(`[scheduler] ${s.mc_username} went OFFLINE (twitch/${s.twitch_login})`);
      }
    } catch (err) {
      // DB flag is left unchanged, so the transition is retried next cycle.
      console.error(`[scheduler] could not update ${s.mc_username}, will retry:`, err.message);
    }
  }
}

export function startScheduler() {
  const intervalMs = config.checkIntervalSeconds * 1000;
  stopped = false;

  // Chained timeouts instead of setInterval so slow passes never overlap.
  const tick = async () => {
    try {
      await checkOnce();
    } catch (err) {
      console.error('[scheduler] unexpected error:', err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  console.log(
    minecraft.isConfigured()
      ? `[scheduler] polling Twitch every ${config.checkIntervalSeconds}s`
      : '[scheduler] Minecraft sync not configured, polling is idle until MC_HTTP_URL and MC_SECRET_TOKEN are set',
  );
  tick();
}

export function stopScheduler() {
  stopped = true;
  clearTimeout(timer);
}
