const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const { parseJapaneseDateTime, formatJst } = require('../utils/datetime');
const { extractChannelId } = require('../utils/channelInput');
const { resolveChannelForMember } = require('../utils/permissions');
const { createReporter } = require('../utils/reporter');
const { tryAcquire, busyMessage } = require('../utils/busy');
const config = require('../config');
const { exportLog } = require('../features/export-log');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('export-log')
        .setDescription('指定期間のメッセージをテキストファイルに出力します')
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
                .setDescription('出力するチャンネルの ID またはリンク（省略時はこのチャンネル）')
                .setRequired(false)
        ),

    async execute(interaction) {

        const { options } = interaction;

        const sourceInput = options.getString('source_channel');
        const startString = options.getString('start');
        const endString = options.getString('end');

        // 3秒以内に応答する必要があるため先に defer
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reporter = createReporter(interaction);

        let lock = null;

        // 分割して送信済みのファイル数
        let sentParts = 0;

        try {

            // ------------------------------------
            // 入力チェック
            // ------------------------------------

            const sourceChannelId = sourceInput
                ? extractChannelId(sourceInput)
                : interaction.channelId;

            if (!sourceChannelId) {
                await interaction.editReply(
                    `「${sourceInput}」からチャンネルIDを読み取れませんでした。\n` +
                    'チャンネル / スレッドの ID かリンクを指定してください。'
                );
                return;
            }

            const startDate = parseJapaneseDateTime(startString, 'start');
            const endDate = parseJapaneseDateTime(endString, 'end');

            const periodText = `${formatJst(startDate)} ～ ${formatJst(endDate)}`;

            if (startDate >= endDate) {
                await interaction.editReply('開始日時は終了日時より前にしてください。');
                return;
            }

            // 実行者本人がそのチャンネルの履歴を読めるか確認
            const source =
                await resolveChannelForMember(interaction, sourceChannelId, 'read', '出力元');

            if (source.error) {
                await interaction.editReply(source.error);
                return;
            }

            const sourceChannel = source.channel;

            // ------------------------------------
            // 取得・出力
            // ------------------------------------

            // メッセージ数は取得してみるまで分からないため、取得中に件数が
            // 上限を超えた時点で重い処理として扱い、同時に1つだけにする。
            // （上限までは保持しているメッセージが少なく、メモリをあまり使わない）
            const acquireIfHeavy = found => {

                if (lock || found <= config.busy.exportLogHeavyMessages) {
                    return;
                }

                lock = tryAcquire(
                    '/export-log（大量）',
                    interaction.member?.displayName ?? interaction.user.username
                );

                if (lock.busy) {
                    throw Object.assign(new Error(busyMessage(lock.busy)), { isBusy: true });
                }
            };

            await reporter.progress('メッセージを取得しています……', { force: true });

            // 古い順に取得しながら、8MB ごとのファイルにしてその場で送る
            const result = await exportLog({
                channel: sourceChannel,
                startDate,
                endDate,
                onProgress: found => {
                    acquireIfHeavy(found);
                    // /busy-stop で中止されたら取得をやめる（catch で中止として返す）
                    lock?.signal?.throwIfAborted();
                    return reporter.progress(`メッセージを取得・出力しています……（${found} 件）`);
                },
                sendPart: async (file, part) => {
                    await reporter.send({
                        content: `ログ ${part} 個目（${sourceChannel}）`,
                        files: [file],
                    });
                    sentParts = part;
                },
            });

            console.log(`ログ出力対象: ${result.count} 件 / ファイル ${result.parts} 個`);

            if (result.count === 0) {
                await reporter.finish(
                    `${sourceChannel} には指定期間（${periodText}）のメッセージがありません。`
                );
                return;
            }

            await reporter.finish({
                content:
                    'ログを出力しました。\n' +
                    `チャンネル: ${sourceChannel}\n` +
                    `期間: ${periodText}\n` +
                    `件数: ${result.count} 件\n` +
                    `ファイル: ${result.parts} 個` +
                    (result.lastFile ? '' : '（大きいため分割して送信しました）'),
                files: result.lastFile ? [result.lastFile] : [],
            });

        } catch (error) {

            // 分割して送信済みのファイルがあれば、そのことも伝える
            const sentNote = sentParts > 0
                ? `\n（ファイル ${sentParts} 個目までは送信済みです）`
                : '';

            // 他の重い処理が実行中だったため、取得の途中で止めた
            if (error.isBusy) {
                await reporter.finish(error.message + sentNote);
                return;
            }

            if (lock?.signal?.aborted) {
                await reporter.finish(`ログ出力を中止しました（${lock.signal.reason.message}）。${sentNote}`);
                return;
            }

            console.error(error);

            await reporter.finish(
                'ログ出力中にエラーが発生しました。\n' +
                `\`${error.message}\`` +
                sentNote
            );

        } finally {
            lock?.release?.();
        }
    },
};
