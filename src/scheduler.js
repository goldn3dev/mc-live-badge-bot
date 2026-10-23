import { config } from './config.js';
import { getAllStreamers, setLiveFlag } from './database.js';
import * as rcon from './services/rcon.js';
import { getLiveUserIds } from './services/twitch.js';

let timer = null;
let stopped = false;

/** One polling pass. Never throws. */
export async function checkOnce() {
  const streamers = getAllStreamers();
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
        await rcon.setLive(s.mc_uuid, s.twitch_login, s.mc_username);
        setLiveFlag(s.discord_id, true);
        console.log(`[scheduler] ${s.mc_username} went LIVE (twitch/${s.twitch_login})`);
      } else if (!isLive && s.is_live) {
        await rcon.setOffline(s.mc_uuid);
        setLiveFlag(s.discord_id, false);
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

  console.log(`[scheduler] polling Twitch every ${config.checkIntervalSeconds}s`);
  tick();
}

export function stopScheduler() {
  stopped = true;
  clearTimeout(timer);
}
