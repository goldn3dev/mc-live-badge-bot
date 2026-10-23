import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { findConflict, getStreamer, saveStreamer } from '../database.js';
import { UserError } from '../errors.js';
import { lookupMinecraftUser } from '../services/mojang.js';
import * as minecraft from '../services/minecraft.js';
import { lookupTwitchUser } from '../services/twitch.js';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Minecraft account to your Twitch channel for the in-game live badge')
  .addStringOption((o) =>
    o.setName('twitch').setDescription('Your Twitch username').setRequired(true).setMaxLength(40),
  )
  .addStringOption((o) =>
    o.setName('minecraft').setDescription('Your Minecraft Java username').setRequired(true).setMaxLength(16),
  );

/**
 * Validate both accounts and store the link for a Discord user. Shared by `/link` and the link panel modal.
 * Throws UserError (safe to show) for invalid names, taken accounts and API outages.
 * Returns the resolved { mc, twitch } records.
 */
export async function linkAccounts(user, minecraftName, twitchName) {
  const [mc, twitch] = await Promise.all([
    lookupMinecraftUser(minecraftName.trim()),
    lookupTwitchUser(twitchName),
  ]);

  const taken = await findConflict(user.id, mc.uuid, twitch.id);
  if (taken) {
    const what = taken.mc_uuid === mc.uuid ? `Minecraft account \`${mc.username}\`` : `Twitch channel \`${twitch.login}\``;
    throw new UserError(`The ${what} is already linked to another Discord user.`);
  }

  // Relinking to a different Minecraft account: clear the badge from the old one.
  const previous = await getStreamer(user.id);
  if (previous?.is_live && previous.mc_uuid !== mc.uuid) {
    try {
      await minecraft.setOffline(previous.mc_uuid);
    } catch (err) {
      console.error(`[link] could not clear old badge for ${previous.mc_username}:`, err.message);
    }
  }

  await saveStreamer({
    discord_id: user.id,
    mc_uuid: mc.uuid,
    mc_username: mc.username,
    twitch_id: twitch.id,
    twitch_login: twitch.login,
  });
  console.log(`[link] ${user.tag}: ${mc.username} (${mc.uuid}) <-> twitch/${twitch.login}`);

  return { mc, twitch };
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { mc, twitch } = await linkAccounts(
    interaction.user,
    interaction.options.getString('minecraft', true),
    interaction.options.getString('twitch', true),
  );

  const channelUrl = `https://twitch.tv/${twitch.login}`;
  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle('Accounts linked')
    .setThumbnail(`https://crafatar.com/avatars/${mc.uuid}?size=128&overlay`)
    .setDescription(
      `**${mc.username}** will get a live badge in Minecraft whenever [${twitch.displayName}](${channelUrl}) is streaming.`,
    )
    .addFields(
      { name: 'Minecraft', value: `\`${mc.username}\``, inline: true },
      { name: 'Twitch', value: `[${twitch.displayName}](${channelUrl})`, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
