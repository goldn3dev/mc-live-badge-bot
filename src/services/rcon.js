import { Rcon } from 'rcon-client';
import { config } from '../config.js';

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

let conn = null;
let connecting = null;
let reconnectTimer = null;
let backoffMs = MIN_BACKOFF_MS;
let shuttingDown = false;

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  console.warn(`[rcon] reconnecting in ${Math.round(backoffMs / 1000)}s`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connect();
    } catch {
      // connect() already logged and scheduled the next attempt
    }
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

/** Open (or reuse) the RCON connection. Rejects on failure and schedules a background retry. */
export function connect() {
  if (conn?.authenticated) return Promise.resolve(conn);
  if (connecting) return connecting;

  connecting = (async () => {
    const client = new Rcon({
      host: config.rcon.host,
      port: config.rcon.port,
      password: config.rcon.password,
      timeout: 5_000,
    });
    // Without an 'error' listener a socket error would crash the process.
    client.on('error', (err) => console.error('[rcon] socket error:', err.message));
    client.on('end', () => {
      if (conn === client) {
        conn = null;
        console.warn('[rcon] connection closed');
        scheduleReconnect();
      }
    });

    await client.connect();
    conn = client;
    backoffMs = MIN_BACKOFF_MS;
    console.log(`[rcon] connected to ${config.rcon.host}:${config.rcon.port}`);
    return client;
  })()
    .catch((err) => {
      console.error(`[rcon] connect failed: ${err.message}`);
      scheduleReconnect();
      throw err;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

/** Drop a broken connection so the next call (or the reconnect timer) builds a fresh one. */
function discard(client) {
  if (conn === client) conn = null;
  client.end().catch(() => {});
  client.socket?.destroy();
}

/** Run a console command, reconnecting and retrying once if the connection is dead. */
async function run(command) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    let client;
    try {
      client = await connect();
      return await client.send(command);
    } catch (err) {
      lastErr = err;
      if (client) discard(client);
    }
  }
  throw new Error(`RCON command failed: ${lastErr.message}`);
}

/** Strip characters that could break out of a quoted LuckPerms argument. */
const sanitizeArg = (s) => s.replace(/["\\\r\n]/g, '');

/**
 * Give the player the live badge and (optionally) announce it in-game.
 * Resolves once the LuckPerms command succeeded; a failed announcement is only logged.
 */
export async function setLive(mcUuid, twitchLogin, mcUsername = twitchLogin) {
  const response = await run(
    `lp user ${mcUuid} meta setsuffix ${config.suffixPriority} "${sanitizeArg(config.liveSuffix)}"`,
  );
  if (response) console.log(`[rcon] ${response.replace(/§./g, '').trim()}`);

  if (config.announceLive) {
    const message = [
      { text: '[LIVE] ', color: 'red', bold: true },
      { text: mcUsername, color: 'yellow' },
      { text: ` is streaming on Twitch! twitch.tv/${twitchLogin}`, color: 'gray' },
    ];
    try {
      await run(`tellraw @a ${JSON.stringify(message)}`);
    } catch (err) {
      console.warn(`[rcon] live announcement failed: ${err.message}`);
    }
  }
}

/** Remove the live badge from the player. */
export async function setOffline(mcUuid) {
  const response = await run(`lp user ${mcUuid} meta removesuffix ${config.suffixPriority}`);
  if (response) console.log(`[rcon] ${response.replace(/§./g, '').trim()}`);
}

export async function close() {
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  if (conn) {
    const client = conn;
    conn = null;
    await client.end().catch(() => {});
  }
}
