const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const { parseJapaneseDateTime, formatJst } = require('../utils/datetime');
const { extractChannelId } = require('../utils/channelInput');
const { resolveChannelForMember } = require('../utils/permissions');
const { createReporter } = require('../utils/reporter');
const { tryAcquire, busyMessage } = require('../utils/busy');
const {
    fetchMessagesInRange,
    getTransferWebhook,
    transferMessages,
} = require('../features/transfer');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('指定期間のメッセージを別チャンネルへ転送します')
        // Discord の仕様で、必須オプションは任意オプションより前に置く必要がある
        .addStringOption(option =>
            option
                .setName('start')
                .setDescription('開始日時 YYYY/MM/DD HH:mm（YY/MM/DD・MM/DD も可。時刻省略で 00:00）')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('end')
                .setDescription('終了日時 YYYY/MM/DD HH:mm（YY/MM/DD・MM/DD も可。時刻省略で 23:59）')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('source_channel')
                .setDescription('転送元の ID またはリンク（省略時はこのチャンネル）')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('target_channel')
                .setDescription('転送先の ID またはリンク（省略時はこのチャンネル）')
                .setRequired(false)
        )
        // 初期状態ではサーバー管理権限を持つ人だけ。
        // サーバー設定 > 連携サービス から、使えるロールを変更できる
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {

        const { options } = interaction;

        // ID・リンク・<#ID> のどれでも受け付ける
        const sourceInput = options.getString('source_channel');
        const targetInput = options.getString('target_channel');

        const startString = options.getString('start');
        const endString = options.getString('end');

        // 3秒以内に応答する必要があるため先に defer
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reporter = createReporter(interaction);

        let lock = null;

        try {

            // ------------------------------------
            // 入力チェック
            // ------------------------------------

            // どちらも省略 → エラー
            // 片方だけ省略 → 省略した方はコマンドを実行したチャンネル / スレッド
            if (!sourceInput && !targetInput) {
                await interaction.editReply(
                    'source_channel と target_channel の少なくとも一方を指定してください。\n' +
                    '省略した方には、このチャンネル / スレッドが使われます。'
                );
                return;
            }

            const sourceChannelId = sourceInput
                ? extractChannelId(sourceInput)
                : interaction.channelId;

            const targetChannelId = targetInput
                ? extractChannelId(targetInput)
                : interaction.channelId;

            if (!sourceChannelId) {
                await interaction.editReply(
                    `転送元「${sourceInput}」からチャンネルIDを読み取れませんでした。\n` +
                    'チャンネル / スレッドの ID かリンクを指定してください。'
                );
                return;
            }

            if (!targetChannelId) {
                await interaction.editReply(
                    `転送先「${targetInput}」からチャンネルIDを読み取れませんでした。\n` +
                    'チャンネル / スレッドの ID かリンクを指定してください。'
                );
                return;
            }

            const startDate = parseJapaneseDateTime(startString, 'start');
            const endDate = parseJapaneseDateTime(endString, 'end');

            if (startDate >= endDate) {
                await interaction.editReply('開始日時は終了日時より前にしてください。');
                return;
            }

            // 実行者本人が 転送元を読める / 転送先に書ける か確認
            const source =
                await resolveChannelForMember(interaction, sourceChannelId, 'read', '転送元');

            if (source.error) {
                await interaction.editReply(source.error);
                return;
            }

            const target =
                await resolveChannelForMember(interaction, targetChannelId, 'write', '転送先');

            if (target.error) {
                await interaction.editReply(target.error);
                return;
            }

            const sourceChannel = source.channel;
            const targetChannel = target.channel;

            // 重い処理は同時に1つだけ（実行中のものがあれば始めない）
            lock = tryAcquire(
                '/transfer',
                interaction.member?.displayName ?? interaction.user.username
            );

            if (lock.busy) {
                await interaction.editReply(busyMessage(lock.busy));
                return;
            }

            // ------------------------------------
            // 転送
            // ------------------------------------

            const webhookInfo = await getTransferWebhook(targetChannel);

            await reporter.progress('メッセージを取得しています……', { force: true });

            const messages = await fetchMessagesInRange(sourceChannel, startDate, endDate, {
                onProgress: found => {
                    // /busy-stop で中止されたら取得をやめる（catch で中止として返す）
                    lock.signal.throwIfAborted();
                    return reporter.progress(`メッセージを取得しています……（${found} 件）`);
                },
            });

            console.log(`転送対象: ${messages.length} 件`);

            const successCount = await transferMessages(messages, targetChannel, webhookInfo, {
                onProgress: (done, total) =>
                    reporter.progress(`転送しています…… ${done} / ${total} 件`),
                signal: lock.signal,
            });

            await reporter.finish(
                (lock.signal.aborted
                    ? `転送を途中で中止しました（${lock.signal.reason.message}）。\n`
                    : '転送が完了しました。\n') +
                `転送元: ${sourceChannel}\n` +
                `転送先: ${targetChannel}\n` +
                `対象: ${messages.length} 件\n` +
                `成功: ${successCount} 件\n` +
                `期間: ${formatJst(startDate)} ～ ${formatJst(endDate)}`
            );

        } catch (error) {

            // メッセージの取得中に /busy-stop で中止された
            if (lock?.signal?.aborted) {
                await reporter.finish(`転送を開始前に中止しました（${lock.signal.reason.message}）。`);
                return;
            }

            console.error(error);

            await reporter.finish(
                '転送中にエラーが発生しました。\n' +
                `\`${error.message}\``
            );

        } finally {
            lock?.release?.();
        }
    },
};
