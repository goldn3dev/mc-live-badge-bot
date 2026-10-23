import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { deleteStreamer, getStreamer } from '../database.js';
import { UserError } from '../errors.js';
import * as minecraft from '../services/minecraft.js';

export const data = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Remove your Minecraft/Twitch link and clear your live badge');

/**
 * Clear the badge and delete a Discord user's link. Shared by `/unlink` and the link panel's Unlink button.
 * Throws UserError when there is nothing to unlink or the badge could not be removed. Returns the deleted row.
 */
export async function unlinkAccount(user) {
  const row = await getStreamer(user.id);
  if (!row) throw new UserError('You do not have a linked account.');

  try {
    await minecraft.setOffline(row.mc_uuid);
  } catch (err) {
    console.error(`[unlink] could not clear badge for ${row.mc_username}:`, err.message);
    // If the badge may still be on the player, keep the row so the user can retry.
    if (row.is_live) {
      throw new UserError(
        'Could not reach the Minecraft server to remove your live badge. Please try unlinking again shortly.',
      );
    }
  }

  await deleteStreamer(user.id);
  console.log(`[unlink] ${user.tag}: ${row.mc_username}`);
  return row;
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const row = await unlinkAccount(interaction.user);
  await interaction.editReply(`Unlinked **${row.mc_username}** from Twitch channel **${row.twitch_login}**.`);
}
