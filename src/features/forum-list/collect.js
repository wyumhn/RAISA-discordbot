const { ChannelType, PermissionFlagsBits, escapeMarkdown } = require('discord.js');

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
// フォーラムのアーカイブ済みスレッドを全件取得
//
// 長期間アクティブでないスレッドは自動アーカイブされ、
// アクティブスレッドの取得には含まれなくなるため別途取得する。
// API は1回最大100件なので、アーカイブ時刻をさかのぼってページングする。
// 一覧に使うだけなのでキャッシュには載せない。
// ========================================

async function fetchArchivedThreads(forum) {

    const threads = [];
    let before;

    while (true) {

        const result = await forum.threads.fetchArchived(
            { type: 'public', before, limit: 100 },
            false
        );

        threads.push(...result.threads.values());

        const last = result.threads.last();

        if (!result.hasMore || !last?.archivedAt) {
            break;
        }

        before = last.archivedAt;
    }

    return threads;
}


// ========================================
// フォーラムごとのスレッドを取得
//
// ・アクティブスレッド + アーカイブ済みスレッド
// ・ロックされたスレッド（クローズ扱い）は除く
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

    const results = [];

    // レート制限を避けるため、フォーラムごとに順番に取得する
    for (const entry of forumIndex) {

        const activeThreads = threadsByForum.get(entry.forumId) ?? [];
        const archivedThreads = await fetchArchivedThreads(entry.forum);

        // アクティブ/アーカイブの切り替わり中に両方に入る場合に備えて重複除去
        const merged = new Map();

        for (const thread of [...activeThreads, ...archivedThreads]) {
            if (!thread.locked) {
                merged.set(thread.id, thread);
            }
        }

        results.push({
            ...entry,
            threads: [...merged.values()],
        });
    }

    return results;
}


// ========================================
// 一覧の行を生成
//
// ■ フォーラムURL
// ├・スレッド名 スレッドURL（タイトル順）
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

            const url = `https://discord.com/channels/${guild.id}/${thread.id}`;

            // アーカイブ済みスレッドはリンクが「不明」と表示されるため、
            // 表示をそろえて全スレッドに名前を添える
            lines.push(`├・${escapeMarkdown(thread.name)} ${url}`);
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
