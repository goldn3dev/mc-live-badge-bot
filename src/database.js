import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'data.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS streamers (
    discord_id TEXT PRIMARY KEY,
    mc_uuid TEXT NOT NULL,
    mc_username TEXT NOT NULL,
    twitch_id TEXT NOT NULL,
    twitch_login TEXT NOT NULL,
    is_live INTEGER DEFAULT 0
  );
`);

const stmts = {
  get: db.prepare('SELECT * FROM streamers WHERE discord_id = ?'),
  all: db.prepare('SELECT * FROM streamers'),
  upsert: db.prepare(`
    INSERT INTO streamers (discord_id, mc_uuid, mc_username, twitch_id, twitch_login, is_live)
    VALUES (@discord_id, @mc_uuid, @mc_username, @twitch_id, @twitch_login, 0)
    ON CONFLICT(discord_id) DO UPDATE SET
      mc_uuid = excluded.mc_uuid,
      mc_username = excluded.mc_username,
      twitch_id = excluded.twitch_id,
      twitch_login = excluded.twitch_login,
      is_live = 0
  `),
  remove: db.prepare('DELETE FROM streamers WHERE discord_id = ?'),
  setLive: db.prepare('UPDATE streamers SET is_live = ? WHERE discord_id = ?'),
  findConflict: db.prepare(
    'SELECT * FROM streamers WHERE discord_id != ? AND (mc_uuid = ? OR twitch_id = ?) LIMIT 1',
  ),
};

export const getStreamer = (discordId) => stmts.get.get(discordId);
export const getAllStreamers = () => stmts.all.all();
export const saveStreamer = (row) => stmts.upsert.run(row);
export const deleteStreamer = (discordId) => stmts.remove.run(discordId);
export const setLiveFlag = (discordId, isLive) => stmts.setLive.run(isLive ? 1 : 0, discordId);

/** Another Discord user that already claimed this Minecraft account or Twitch channel. */
export const findConflict = (discordId, mcUuid, twitchId) =>
  stmts.findConflict.get(discordId, mcUuid, twitchId);

export const closeDatabase = () => db.close();
