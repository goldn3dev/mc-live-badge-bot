import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { UserError } from '../errors.js';
import { linkAccounts } from './link.js';
import { unlinkAccount } from './unlink.js';

export const OPEN_MODAL_ID = 'open_link_modal';
export const MODAL_ID = 'link_account_modal';
export const UNLINK_ID = 'unlink_account';

export const data = new SlashCommandBuilder()
  .setName('sendlinkpanel')
  .setDescription('Post the "Link Account" panel in this channel (administrators only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/** /sendlinkpanel: post the embed + persistent button into the current channel. */
export async function execute(interaction) {
  // Defence in depth: the default permission can be overridden in Server Settings -> Integrations.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    throw new UserError('Only administrators can use this command.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle('Link Minecraft & Twitch')
    .setDescription('Click the button below to link your Minecraft and Twitch accounts for live badges on the server.');
  const linkButton = new ButtonBuilder()
    .setCustomId(OPEN_MODAL_ID)
    .setLabel('Link Account')
    .setEmoji('🔗')
    .setStyle(ButtonStyle.Primary);
  const unlinkButton = new ButtonBuilder()
    .setCustomId(UNLINK_ID)
    .setLabel('Unlink Account')
    .setStyle(ButtonStyle.Danger);

  try {
    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(linkButton, unlinkButton)],
    });
  } catch (err) {
    console.error('[sendlinkpanel] could not post the panel:', err.message);
    throw new UserError(
      'I could not post in this channel. Give the bot **View Channel**, **Send Messages** and **Embed Links** here, then try again.',
    );
  }
  await interaction.editReply('Link panel posted.');
}

/** Button click: open the modal. */
export async function openLinkModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Link Your Accounts')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mc_ign')
          .setLabel('Minecraft In-Game Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(16),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('twitch_username')
          .setLabel('Twitch Username')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(26),
      ),
    );
  await interaction.showModal(modal);
}

/** Unlink button: same as /unlink. */
export async function unlinkFromPanel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const row = await unlinkAccount(interaction.user);
  await interaction.editReply(`Unlinked **${row.mc_username}** from Twitch channel **${row.twitch_login}**.`);
}

/** Modal submit: run the same validation and storage as /link. */
export async function submitLinkModal(interaction) {
  // Mojang/Twitch lookups can outlast Discord's 3 second window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { mc, twitch } = await linkAccounts(
    interaction.user,
    interaction.fields.getTextInputValue('mc_ign'),
    interaction.fields.getTextInputValue('twitch_username'),
  );

  await interaction.editReply(`✅ Successfully linked **${mc.username}** to Twitch channel **${twitch.displayName}**!`);
}
