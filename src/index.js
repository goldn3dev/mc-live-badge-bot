import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { closeDatabase, initDatabase } from './database.js';
import { createHealthServer } from './health.js';
import { UserError } from './errors.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import * as link from './commands/link.js';
import * as unlink from './commands/unlink.js';

const commands = new Map([link, unlink].map((c) => [c.data.name, c]));

/** Run a startup step, logging when it begins, ends and (if it drags on) that it is still pending. */
async function step(name, fn) {
  const started = Date.now();
  console.log(`[startup] ${name}...`);
  const watchdog = setInterval(
    () => console.warn(`[startup] ${name} still pending after ${Math.round((Date.now() - started) / 1000)}s`),
    15_000,
  );
  try {
    const result = await fn();
    console.log(`[startup] ${name} done in ${Date.now() - started}ms`);
    return result;
  } finally {
    clearInterval(watchdog);
  }
}

async function probeDiscord() {
  const started = Date.now();
  try {
    const res = await fetch('https://discord.com/api/v10/gateway', { signal: AbortSignal.timeout(10_000) });
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 200);
    console.log(
      `[probe] discord.com/api -> HTTP ${res.status} in ${Date.now() - started}ms ` +
        `(server=${res.headers.get('server')}, retry-after=${res.headers.get('retry-after')}, cf-ray=${res.headers.get('cf-ray')}) ${body}`,
    );
  } catch (err) {
    console.error(`[probe] discord.com/api unreachable after ${Date.now() - started}ms: ${err.cause?.code ?? err.message}`);
  }
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  rest.on('rateLimited', (info) =>
    console.warn(`[discord] rate limited on ${info.method} ${info.route}, retry in ${info.timeToReset}ms (global: ${info.global})`),
  );
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
    body: [...commands.values()].map((c) => c.data.toJSON()),
  });
  console.log(`[discord] registered ${commands.size} guild commands`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    const message =
      err instanceof UserError ? err.message : 'Something went wrong. Please try again later.';
    if (!(err instanceof UserError)) console.error(`[discord] /${interaction.commandName} failed:`, err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message, embeds: [] });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    } catch (replyErr) {
      console.error('[discord] could not send error reply:', replyErr.message);
    }
  }
});

client.on(Events.Error, (err) => console.error('[discord] client error:', err));
client.on(Events.ShardReady, (id) => console.log(`[discord] shard ${id} ready`));
client.on(Events.ShardError, (err, id) => console.error(`[discord] shard ${id} error:`, err.message));
client.on(Events.ShardDisconnect, (event, id) => console.warn(`[discord] shard ${id} disconnected (code ${event.code})`));
client.rest.on('rateLimited', (info) =>
  console.warn(`[discord] rate limited on ${info.method} ${info.route}, retry in ${info.timeToReset}ms (global: ${info.global})`),
);

// Keep a stray rejection (e.g. a dropped socket) from taking the bot down.
process.on('unhandledRejection', (err) => console.error('[process] unhandled rejection:', err));

const healthServer = createHealthServer();

async function shutdown(signal) {
  console.log(`[process] ${signal} received, shutting down`);
  stopScheduler();
  healthServer.close();
  await client.destroy();
  await closeDatabase();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  // Open the port first so the platform's port scan passes while the rest starts up.
  healthServer.listen(config.port, '0.0.0.0', () =>
    console.log(`[health] listening on 0.0.0.0:${config.port}`),
  );

  await step('initialising database', initDatabase);

  // Diagnostic: shows whether this host can reach Discord's API at all, and what it answers with.
  await probeDiscord();

  // Log in first so the bot shows online even if command registration is slow or fails.
  await step('logging in to Discord', () => client.login(config.discord.token));
  console.log(`[discord] logged in as ${client.user.tag}`);

  startScheduler();

  // Commands persist on Discord's side, so a failure here is not fatal.
  step('registering slash commands', registerCommands).catch((err) =>
    console.error('[discord] command registration failed:', err),
  );
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
