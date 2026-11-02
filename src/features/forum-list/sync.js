const config = require('../../config');
const { mapWithConcurrency } = require('../../utils/concurrency');

const { maxMessages, apiConcurrency } = config.forumList;


// ========================================
// チャンネル内の Bot 自身のメッセージを取得
//
// 最新100件から開始し、Bot メッセージが maxMessages 件見つかった
// 時点で終了する。足りない場合だけ過去へ遡る。
// 通常は API 1回で済む。
//
// 戻り値は古い順。
// ========================================

async function fetchBotMessages(channel, botUserId) {

    const botMessages = [];

    let before = null;

    while (botMessages.length < maxMessages) {

        const options = { limit: 100 };

        if (before) {
            options.before = before;
        }

        const fetched = await channel.messages.fetch(options);

        if (fetched.size === 0) {
            break;
        }

        for (const message of fetched.values()) {

            if (message.author.id !== botUserId) {
                continue;
            }

            botMessages.push(message);

            if (botMessages.length >= maxMessages) {
                break;
            }
        }

        const oldest = fetched.last();

        // 100件未満なら、これ以上遡れない
        if (!oldest || fetched.size < 100) {
            break;
        }

        before = oldest.id;
    }

    botMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    return botMessages.slice(-maxMessages);
}


// ========================================
// 既存メッセージを編集（内容が変わったものだけ・並列）
//
// 戻り値: 既存メッセージで賄えた件数
// ========================================

async function editMessages(previousMessages, newMessages) {

    const updateCount = Math.min(previousMessages.length, newMessages.length);

    const targets = [];

    for (let i = 0; i < updateCount; i++) {

        if (previousMessages[i].content === newMessages[i]) {
            console.log(`${i + 1}/${newMessages.length} 個目：変更なし`);
            continue;
        }

        targets.push({
            index: i,
            message: previousMessages[i],
            content: newMessages[i],
        });
    }

    await mapWithConcurrency(targets, apiConcurrency, async target => {

        try {
            await target.message.edit(target.content);
            console.log(`${target.index + 1}/${newMessages.length} 個目を編集しました`);
        } catch (error) {
            console.error(`${target.index + 1}個目の編集に失敗しました:`, error);
        }
    });

    return updateCount;
}


// ========================================
// 足りない分を新規送信
//
// 並列に送ると表示順が崩れる可能性があるため直列。
// 失敗したらその時点で中断し false を返す。
// ========================================

async function sendNewMessages(channel, messages, startIndex) {

    for (let i = startIndex; i < messages.length; i++) {

        try {
            await channel.send(messages[i]);
            console.log(`${i + 1}/${messages.length} 個目を新規作成しました`);
        } catch (error) {
            console.error(`${i + 1}個目の新規作成に失敗しました:`, error);
            return false;
        }
    }

    return true;
}


// ========================================
// 不要になった古いメッセージを削除（並列）
// ========================================

async function deleteOldMessages(previousMessages, startIndex) {

    const targets = previousMessages.slice(startIndex);

    await mapWithConcurrency(targets, apiConcurrency, async (message, offset) => {

        try {
            await message.delete();
            console.log(
                `不要になった古いBotメッセージ ${startIndex + offset + 1} 個目を削除しました`
            );
        } catch (error) {
            console.error(`古いBotメッセージ ${message.id} の削除に失敗しました:`, error);
        }
    });
}

module.exports = {
    fetchBotMessages,
    editMessages,
    sendNewMessages,
    deleteOldMessages,
};
