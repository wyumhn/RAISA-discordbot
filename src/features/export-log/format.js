const { formatJst, formatJstSeconds } = require('../../utils/datetime');
const { mentionsToText } = require('../transfer/mentions');

// ========================================
// メッセージをログ用のテキストに整形する
//
// [2026/10/05 09:00:12] たろう (taro)
//   ↳ 返信元: https://discord.com/channels/...
//   本文1行目
//   本文2行目
//   [添付] image.png https://cdn.discordapp.com/...
//   [リアクション] 👍 3　❤️ 2
// ========================================

const INDENT = '  ';


function formatAuthor(message) {

    const displayName =
        message.member?.displayName ||
        message.author.globalName ||
        message.author.username;

    const name = displayName === message.author.username
        ? displayName
        : `${displayName} (${message.author.username})`;

    return message.author.bot ? `${name} [BOT]` : name;
}


// カスタム絵文字は :名前: に
function formatEmoji(emoji) {
    return emoji.id ? `:${emoji.name}:` : emoji.name;
}


// 本文のメンション・チャンネル・カスタム絵文字を読める文字に
function formatContent(message) {

    return mentionsToText(message.content, message)
        .replace(/<#(\d+)>/g, (raw, id) => {
            const channel = message.guild?.channels.cache.get(id);
            return channel ? `#${channel.name}` : raw;
        })
        .replace(/<a?:(\w+):\d+>/g, ':$1:');
}


function formatMessage(message) {

    const lines = [];

    let header = `[${formatJstSeconds(message.createdAt)}] ${formatAuthor(message)}`;

    if (message.editedTimestamp) {
        header += ' (編集済み)';
    }

    lines.push(header);

    // 返信元
    if (message.reference?.messageId) {
        lines.push(
            `${INDENT}↳ 返信元: https://discord.com/channels/` +
            `${message.guildId}/${message.reference.channelId}/${message.reference.messageId}`
        );
    }

    // 本文
    if (message.content) {
        for (const line of formatContent(message).split('\n')) {
            lines.push(INDENT + line);
        }
    }

    // 添付ファイル
    for (const attachment of message.attachments.values()) {
        lines.push(`${INDENT}[添付] ${attachment.name} ${attachment.url}`);
    }

    // スタンプ
    for (const sticker of message.stickers.values()) {
        lines.push(`${INDENT}[スタンプ] ${sticker.name}`);
    }

    // 埋め込み（リンクのプレビューなど）
    for (const embed of message.embeds) {
        const text = [embed.title, embed.url].filter(Boolean).join(' ');
        if (text) {
            lines.push(`${INDENT}[埋め込み] ${text}`);
        }
    }

    // リアクション
    if (message.reactions.cache.size > 0) {
        const reactions = message.reactions.cache
            .map(reaction => `${formatEmoji(reaction.emoji)} ${reaction.count ?? 0}`)
            .join('　');
        lines.push(`${INDENT}[リアクション] ${reactions}`);
    }

    // 何も中身がない（ピン留め通知などのシステムメッセージ等）
    if (lines.length === 1) {
        lines.push(`${INDENT}${message.system ? '(システムメッセージ)' : '(本文なし)'}`);
    }

    return lines.join('\n');
}


// ========================================
// ファイル先頭の情報
// ========================================

function formatHeader({ channel, startDate, endDate, messageCount, part, totalParts }) {

    const lines = [
        `チャンネル: #${channel.name} (${channel.id})`,
        `サーバー: ${channel.guild?.name ?? '-'}`,
        `期間: ${formatJst(startDate)} ～ ${formatJst(endDate)}（日本時間）`,
        `件数: ${messageCount} 件`,
        `出力日時: ${formatJstSeconds(new Date())}`,
    ];

    if (totalParts > 1) {
        lines.push(`ファイル: ${part} / ${totalParts}`);
    }

    lines.push('='.repeat(40), '');

    return lines.join('\n');
}

module.exports = {
    formatMessage,
    formatHeader,
};
