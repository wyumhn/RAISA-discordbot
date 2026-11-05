const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const config = require('../config');
const { createReporter } = require('../utils/reporter');
const { updateForumMessages } = require('../features/forum-list');

// ========================================
// フォーラム・スレッド一覧を今すぐ更新する
//
// 毎日の定期実行（jobs/forum-list.js）と同じ処理を手動で行う。
// ========================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName('update-forums')
        .setDescription('フォーラム・スレッド一覧を今すぐ更新します')
        // 初期状態ではサーバー管理権限を持つ人だけ。
        // サーバー設定 > 連携サービス から、使えるロールを変更できる
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {

        // 3秒以内に応答する必要があるため先に defer
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // スレッドが多いと時間がかかるため、15分を過ぎても結果が届くようにする
        const reporter = createReporter(interaction);

        await reporter.progress('フォーラム一覧を更新しています……', { force: true });

        const result = await updateForumMessages(interaction.client);

        if (!result.success) {
            await reporter.finish(
                result.alreadyRunning
                    ? 'フォーラム一覧はすでに更新中です。終わってから、もう一度実行してください。'
                    : `フォーラム一覧の更新に失敗しました。\n${result.reason}`
            );
            return;
        }

        await reporter.finish(
            'フォーラム一覧を更新しました。\n' +
            `一覧: <#${config.forumList.channelId}>\n` +
            `フォーラム: ${result.forumCount} 件\n` +
            `メッセージ: ${result.messageCount} 件`
        );
    },
};
