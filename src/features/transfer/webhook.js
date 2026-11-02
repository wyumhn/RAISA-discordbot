const config = require('../../config');

// Bot が作成した Webhook を探し、なければ作成する
async function findOrCreateWebhook(channel) {

    const webhooks = await channel.fetchWebhooks();

    const existing = webhooks.find(
        webhook => webhook.owner?.id === channel.client.user.id
    );

    if (existing) {
        return existing;
    }

    return channel.createWebhook({
        name: config.transfer.webhookName,
    });
}


// ========================================
// 転送先の Webhook を取得 / 作成
//
// スレッドには Webhook を作れないため、親チャンネルの Webhook を使い
// 送信時に threadId を指定する。
// ========================================

async function getTransferWebhook(channel) {

    // 通常のチャンネル
    if (typeof channel.fetchWebhooks === 'function') {
        return {
            webhook: await findOrCreateWebhook(channel),
            threadId: undefined,
        };
    }

    // スレッド
    if (channel.isThread?.()) {

        const parent = channel.parent;

        if (!parent) {
            throw new Error('スレッドの親チャンネルを取得できませんでした。');
        }

        return {
            webhook: await findOrCreateWebhook(parent),
            threadId: channel.id,
        };
    }

    throw new Error('転送先チャンネルではWebhookを使用できません。');
}

module.exports = {
    getTransferWebhook,
};
