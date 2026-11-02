const { ChannelType, PermissionFlagsBits } = require('discord.js');

const config = require('../../config');

const { excludedCategoryIds } = config.forumList;


// ========================================
// 一覧の対象になるフォーラムを抽出
//
// ・除外カテゴリーにあるものは除く
// ・対象ロールに投稿権限がないものは除く
// ・カテゴリー順 → フォーラム順に並べる
// ========================================

function buildForumIndex(channels, guild, targetRole) {

    const index = [];

    for (const forum of channels.values()) {

        if (!forum || forum.type !== ChannelType.GuildForum) {
            continue;
        }

        const categoryId = forum.parentId;

        if (excludedCategoryIds.includes(categoryId)) {
            continue;
        }

        const permissions = targetRole
            ? forum.permissionsFor(targetRole)
            : null;

        if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
            console.log(`除外: ${forum.name}（一般メンバーに投稿権限なし）`);
            continue;
        }

        index.push({
            forum,
            forumId: forum.id,
            forumName: forum.name,
            categoryId,
            categoryPosition: forum.parent?.position ?? Number.MAX_SAFE_INTEGER,
            forumPosition: forum.position,
            forumUrl: `https://discord.com/channels/${guild.id}/${forum.id}`,
        });
    }

    index.sort((a, b) =>
        a.categoryPosition !== b.categoryPosition
            ? a.categoryPosition - b.categoryPosition
            : a.forumPosition - b.forumPosition
    );

    return index;
}


// ========================================
// フォーラムごとのアクティブスレッドを取得
//
// discord.js の forum.threads.fetch() は、内部で
// 「サーバー全体のアクティブスレッド」を取得してから絞り込んでいる。
// フォーラムごとに呼ぶと同じ取得をフォーラムの数だけ繰り返すため、
// サーバー全体を1回だけ取得して、親フォーラムごとに振り分ける。
// ========================================

async function fetchForumThreads(guild, forumIndex) {

    const { threads } = await guild.channels.fetchActiveThreads();

    const threadsByForum = new Map();

    for (const thread of threads.values()) {

        if (!threadsByForum.has(thread.parentId)) {
            threadsByForum.set(thread.parentId, []);
        }

        threadsByForum.get(thread.parentId).push(thread);
    }

    return forumIndex.map(entry => ({
        ...entry,
        threads: threadsByForum.get(entry.forumId) ?? [],
    }));
}


// ========================================
// 一覧の行を生成
//
// ■ フォーラムURL
// ├・スレッドURL（タイトル順）
// （フォーラム間に空行）
// ========================================

// 毎回 localeCompare するより Collator を使い回す方が速い
const japaneseCollator = new Intl.Collator('ja', {
    numeric: true,
    sensitivity: 'base',
});

function buildLines(forumResults, guild) {

    const lines = [];

    for (const entry of forumResults) {

        lines.push(`■ ${entry.forumUrl}`);

        const sortedThreads = [...entry.threads].sort(
            (a, b) => japaneseCollator.compare(a.name, b.name)
        );

        for (const thread of sortedThreads) {
            lines.push(`├・https://discord.com/channels/${guild.id}/${thread.id}`);
        }

        lines.push('');
    }

    // 最後の空行を削除
    lines.pop();

    return lines;
}

module.exports = {
    buildForumIndex,
    fetchForumThreads,
    buildLines,
};
