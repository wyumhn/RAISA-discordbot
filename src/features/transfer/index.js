// メッセージ転送機能（/transfer から使用）

const { fetchMessagesInRange } = require('./fetch');
const { getTransferWebhook } = require('./webhook');
const { transferMessage, transferMessages } = require('./send');

module.exports = {
    fetchMessagesInRange,
    getTransferWebhook,
    transferMessage,
    transferMessages,
};
