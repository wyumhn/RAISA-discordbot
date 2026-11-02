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
// 2000文字ごとのメッセージに分ける
//
// 行の区切りでまとめ、1行が長すぎるときだけ途中で切る。
// ========================================

const MAX_CONTENT_LENGTH = 2000;

function splitContent(text) {

    const chunks = [];
    let current = '';

    for (let line of text.split('\n')) {

        while (line.length > MAX_CONTENT_LENGTH) {
            if (current) {
                chunks.push(current);
                current = '';
            }
            chunks.push(line.slice(0, MAX_CONTENT_LENGTH));
            line = line.slice(MAX_CONTENT_LENGTH);
        }

        const next = current ? `${current}\n${line}` : line;

        if (next.length > MAX_CONTENT_LENGTH) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks;
}


// ========================================
// 本文（添付ファイルはリンクにして一緒に送る）
//
// 添付ファイルをダウンロードしてアップロードし直すとメモリを多く使うため、
// Discord 上の URL を貼る（Discord が画像・動画をプレビュー表示する）。
// ※ 元のメッセージが削除されると、リンク先のファイルも見られなくなる。
// ========================================

function attachmentLink(attachment) {
    // ネタバレ指定の添付は、リンクもネタバレ表示にする
    return attachment.spoiler ? `||${attachment.url}||` : attachment.url;
}

async function sendBody(webhookInfo, message) {

    // メンションは `@名前` にして通知・ハイライトされないようにする
    const content = escapeMentions(message.content, message);

    const links = message.attachments.map(attachmentLink);

    const text = [content, ...links].filter(Boolean).join('\n');

    // 本文も添付もない（スタンプのみ等）場合は送るものがない
    if (!text) {
        return;
    }

    for (const chunk of splitContent(text)) {
        await sendAsUser(webhookInfo, message, { content: chunk });
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
// signal（AbortSignal）が中止されたら、次のメッセージの前で止める。
// 戻り値: 成功件数
// ========================================

async function transferMessages(messages, targetChannel, webhookInfo, { onProgress, signal } = {}) {

    let successCount = 0;

    for (const [index, message] of messages.entries()) {

        if (signal?.aborted) {
            break;
        }

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
