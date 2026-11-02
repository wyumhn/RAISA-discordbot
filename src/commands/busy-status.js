const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const { getStatus } = require('../utils/busy');
const { formatJst } = require('../utils/datetime');

const OWNER_LABELS = {
    bot: 'Bot のコマンド',
    update: 'サーバーの更新（deploy/update.sh）',
};


// 状況を返信用の文にする（/busy-stop からも使う）
function describeStatus(status) {

    if (!status) {
        return '実行中の重い処理はありません。';
    }

    const { lock, stale, stopping } = status;

    if (!lock) {
        return (
            'ロックファイル（data/busy.lock）を読み取れませんでした。\n' +
            (stale
                ? '古いロックの可能性が高いため、/busy-stop で解除できます。'
                : '書き込み中の可能性があります。少し待ってから、もう一度確認してください。')
        );
    }

    const startedAt = new Date(lock.startedAt);
    const minutes = Math.floor((Date.now() - startedAt.getTime()) / 60000);

    const state = stale
        ? '古いロック（実際には実行されていません。/busy-stop で解除できます）'
        : stopping
            ? '中止を要求済み（処理中のメッセージが終わり次第止まります）'
            : '実行中';

    return [
        `処理: ${lock.task}`,
        `実行者: ${lock.by ?? '不明'}`,
        `種類: ${OWNER_LABELS[lock.owner] ?? '不明'}`,
        `開始: ${formatJst(startedAt)}（${minutes} 分経過）`,
        `状態: ${state}`,
    ].join('\n');
}

module.exports = {

    data: new SlashCommandBuilder()
        .setName('busy-status')
        .setDescription('重い処理（/transfer など）の実行状況を表示します')
        // 初期状態ではサーバー管理権限を持つ人だけ。
        // サーバー設定 > 連携サービス から、使えるロールを変更できる
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await interaction.reply({
            content: describeStatus(getStatus()),
            flags: MessageFlags.Ephemeral,
        });
    },

    describeStatus,
};
