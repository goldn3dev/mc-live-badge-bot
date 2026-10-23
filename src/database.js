import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

function connect() {
  if (config.database.url) {
    const { protocol, host } = new URL(config.database.url);
    console.log(`[db] using remote database ${protocol}//${host}`);
    return createClient({ url: config.database.url, authToken: config.database.authToken });
  }

  const file = resolve(config.database.path);
  mkdirSync(dirname(file), { recursive: true });
  console.log(`[db] using SQLite file ${file}`);
  return createClient({ url: `file:${file.replaceAll('\\', '/')}` });
}

const db = connect();

/** Create the table if needed. Call once at startup. */
export async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS streamers (
      discord_id TEXT PRIMARY KEY,
      mc_uuid TEXT NOT NULL,
      mc_username TEXT NOT NULL,
      twitch_id TEXT NOT NULL,
      twitch_login TEXT NOT NULL,
      is_live INTEGER DEFAULT 0
    )
  `);
}

/** libSQL rows are array-like; hand callers plain objects. */
const toObject = (row) => (row ? { ...row } : undefined);

export async function getStreamer(discordId) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM streamers WHERE discord_id = ?',
    args: [discordId],
  });
  return toObject(rows[0]);
}

export async function getAllStreamers() {
  const { rows } = await db.execute('SELECT * FROM streamers');
  return rows.map(toObject);
}

export async function saveStreamer(row) {
  await db.execute({
    sql: `
      INSERT INTO streamers (discord_id, mc_uuid, mc_username, twitch_id, twitch_login, is_live)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(discord_id) DO UPDATE SET
        mc_uuid = excluded.mc_uuid,
        mc_username = excluded.mc_username,
        twitch_id = excluded.twitch_id,
        twitch_login = excluded.twitch_login,
        is_live = 0
    `,
    args: [row.discord_id, row.mc_uuid, row.mc_username, row.twitch_id, row.twitch_login],
  });
}

export async function deleteStreamer(discordId) {
  await db.execute({ sql: 'DELETE FROM streamers WHERE discord_id = ?', args: [discordId] });
}

export async function setLiveFlag(discordId, isLive) {
  await db.execute({
    sql: 'UPDATE streamers SET is_live = ? WHERE discord_id = ?',
    args: [isLive ? 1 : 0, discordId],
  });
}

/** Another Discord user that already claimed this Minecraft account or Twitch channel. */
export async function findConflict(discordId, mcUuid, twitchId) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM streamers WHERE discord_id != ? AND (mc_uuid = ? OR twitch_id = ?) LIMIT 1',
    args: [discordId, mcUuid, twitchId],
  });
  return toObject(rows[0]);
}

export const closeDatabase = () => db.close();
