import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { closeDatabase, initDatabase } from './database.js';
import { createHealthServer } from './health.js';
import { UserError } from './errors.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import * as link from './commands/link.js';
import * as unlink from './commands/unlink.js';

const commands = new Map([link, unlink].map((c) => [c.data.name, c]));

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
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

  await initDatabase();
  await registerCommands();
  await client.login(config.discord.token);
  console.log(`[discord] logged in as ${client.user.tag}`);

  startScheduler();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
