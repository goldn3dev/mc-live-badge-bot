import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { deleteStreamer, getStreamer } from '../database.js';
import { UserError } from '../errors.js';
import * as minecraft from '../services/minecraft.js';

export const data = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Remove your Minecraft/Twitch link and clear your live badge');

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const row = await getStreamer(interaction.user.id);
  if (!row) throw new UserError('You do not have a linked account.');

  try {
    await minecraft.setOffline(row.mc_uuid);
  } catch (err) {
    console.error(`[unlink] could not clear badge for ${row.mc_username}:`, err.message);
    // If the badge may still be on the player, keep the row so the user can retry.
    if (row.is_live) {
      throw new UserError(
        'Could not reach the Minecraft server to remove your live badge. Please try `/unlink` again shortly.',
      );
    }
  }

  await deleteStreamer(interaction.user.id);
  console.log(`[unlink] ${interaction.user.tag}: ${row.mc_username}`);
  await interaction.editReply(`Unlinked **${row.mc_username}** from Twitch channel **${row.twitch_login}**.`);
}
