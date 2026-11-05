// フォーラム・スレッド一覧機能（/update-forums から使用）

const config = require('../../config');
const { getGuild } = require('../../utils/guild');

const { buildForumIndex, fetchForumThreads, buildLines } = require('./collect');
const { paginate } = require('./paginate');
const {
    fetchBotMessages,
    editMessages,
    sendNewMessages,
    deleteOldMessages,
} = require('./sync');

const { channelId, targetRoleId, maxMessages } = config.forumList;


function failure(reason) {
    console.error(reason);
    return { success: false, reason };
}


// 定期実行と /update-forums が同時に動くと、同じメッセージを
// 両方が編集・削除して一覧が崩れるため、同時に1つだけにする
let updating = false;


// ========================================
// フォーラム一覧を作り直し、一覧チャンネルの Bot メッセージに反映する
//
// 戻り値:
//   { success: true,  forumCount, messageCount }
//   { success: false, reason, alreadyRunning? }
// ========================================

async function updateForumMessages(client) {

    if (updating) {
        return { ...failure('フォーラム一覧はすでに更新中です。'), alreadyRunning: true };
    }

    updating = true;

    try {
        return await rebuildForumMessages(client);
    } finally {
        updating = false;
    }
}


async function rebuildForumMessages(client) {

    const guild = await getGuild(client);

    if (!guild) {
        return failure('サーバーが見つかりません。');
    }

    // ------------------------------------
    // 一覧の生成
    // ------------------------------------

    console.time('一覧生成');

    const channels = await guild.channels.fetch();
    const targetRole = guild.roles.cache.get(targetRoleId);

    const forumIndex = buildForumIndex(channels, guild, targetRole);

    console.log(`対象フォーラム: ${forumIndex.length} 件`);

    const forumResults = await fetchForumThreads(guild, forumIndex);

    const messages = paginate(buildLines(forumResults, guild));

    console.timeEnd('一覧生成');

    // 収まらない場合は、情報を失わないよう更新しない
    if (messages.length > maxMessages) {
        return failure(
            `一覧が${maxMessages}メッセージを超えています（${messages.length} メッセージ）。` +
            '情報を失わないため、更新を中止しました。'
        );
    }

    // ------------------------------------
    // 一覧チャンネルへの反映
    // ------------------------------------

    const channel = await client.channels.fetch(channelId);

    if (!channel) {
        return failure('送信先チャンネルが見つかりません。');
    }

    console.time('メッセージ反映');

    const previousMessages = await fetchBotMessages(channel, client.user.id);

    console.log(`過去のBotメッセージ: ${previousMessages.length} 件`);

    const updateCount = await editMessages(previousMessages, messages);

    const sent = await sendNewMessages(channel, messages, updateCount);

    if (!sent) {
        console.timeEnd('メッセージ反映');
        return failure('メッセージの新規作成に失敗したため、途中で中止しました。');
    }

    await deleteOldMessages(previousMessages, messages.length);

    console.timeEnd('メッセージ反映');

    console.log(`完了：${messages.length} 個のメッセージを更新しました`);

    return {
        success: true,
        forumCount: forumIndex.length,
        messageCount: messages.length,
    };
}

module.exports = {
    updateForumMessages,
};
