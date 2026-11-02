const config = require('../../config');
const { sleep } = require('../../utils/sleep');
const { escapeMentions } = require('./mentions');

const NO_MENTIONS = { parse: [] };


// ========================================
// 元のユーザー名・アイコンで送信（Webhook）
//
// 転送で送るものはすべてこの関数を通す。
// options には content / files など webhook.send() の項目を渡す。
// ========================================

async function sendAsUser(webhookInfo, message, options) {

    const { webhook, threadId } = webhookInfo;

    return webhook.send({
        ...options,

        username:
            message.member?.displayName ||
            message.author.globalName ||
            message.author.username,

        avatarURL: message.author.displayAvatarURL({
            extension: 'png',
            size: 128,
        }),

        // 転送先がスレッドなら、そのスレッドへ送信
        threadId,

        allowedMentions: NO_MENTIONS,
    });
}


// ========================================
// 返信元メッセージへのリンク
// ========================================

async function sendReplyReference(webhookInfo, message) {

    if (!message.reference?.messageId) {
        return;
    }

    const link =
        'https://discord.com/channels/' +
        `${message.guildId}/` +
        `${message.reference.channelId}/` +
        `${message.reference.messageId}`;

    await sendAsUser(webhookInfo, message, {
        content: `> 返信元: ${link}`,
    });
}


// ========================================
// 本文（添付ファイルがあれば一緒に送る）
// ========================================

async function sendBody(webhookInfo, message) {

    // メンションは `@名前` にして通知・ハイライトされないようにする
    const content = escapeMentions(message.content, message) || undefined;

    // 本文も添付もない（スタンプのみ等）場合は送るものがない
    if (!content && message.attachments.size === 0) {
        return;
    }

    if (message.attachments.size === 0) {
        await sendAsUser(webhookInfo, message, { content });
        return;
    }

    try {

        await sendAsUser(webhookInfo, message, {
            content,
            files: message.attachments.map(attachment => ({
                attachment: attachment.url,
                name: attachment.name,
            })),
        });

    } catch (error) {

        // ファイルサイズ超過などで添付できなかった場合は、
        // 本文 + 添付ファイルのURLで送る
        console.error(`添付ファイルの転送に失敗: ${message.id}`, error);

        const urls = message.attachments.map(attachment => attachment.url);

        await sendAsUser(webhookInfo, message, {
            content: [content, ...urls].filter(Boolean).join('\n'),
        });
    }
}


// ========================================
// リアクションを1行にまとめて送信
//
// 例: 👍 3　❤️ 2　<:custom:123> 1
// ========================================

function formatEmoji(emoji) {

    // カスタム絵文字
    if (emoji.id) {
        return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
    }

    // Unicode 絵文字
    return emoji.name;
}

async function sendReactions(webhookInfo, message) {

    if (message.reactions.cache.size === 0) {
        return;
    }

    const content = message.reactions.cache
        .map(reaction => `${formatEmoji(reaction.emoji)} ${reaction.count ?? 0}`)
        .join('　');

    await sendAsUser(webhookInfo, message, { content });
}


// ========================================
// メッセージ1件を転送
//
// 1. 返信元リンク
// 2. 本文 + 添付ファイル
// 3. リアクション
//
// いずれも Webhook で、送信元ユーザーの名前・アイコンで送る。
// targetChannel は互換性のため受け取っているが、送信先は webhookInfo で決まる。
// ========================================

async function transferMessage(message, targetChannel, webhookInfo) {

    console.log(
        `転送: ${message.id} ` +
        `${message.author.username} ` +
        `"${message.content.slice(0, 50)}"`
    );

    await sendReplyReference(webhookInfo, message);
    await sendBody(webhookInfo, message);
    await sendReactions(webhookInfo, message);
}


// ========================================
// メッセージをまとめて古い順に転送
//
// onProgress(処理済み件数, 全件数) を渡すと1件ごとに呼ばれる。
// 戻り値: 成功件数
// ========================================

async function transferMessages(messages, targetChannel, webhookInfo, { onProgress } = {}) {

    let successCount = 0;

    for (const [index, message] of messages.entries()) {

        try {
            await transferMessage(message, targetChannel, webhookInfo);

            successCount++;

            // 大量転送時のレート制限対策
            await sleep(config.transfer.delayMs);

        } catch (error) {
            console.error(`メッセージ ${message.id} の転送に失敗`, error);
        }

        await onProgress?.(index + 1, messages.length);
    }

    return successCount;
}

module.exports = {
    transferMessage,
    transferMessages,
};
