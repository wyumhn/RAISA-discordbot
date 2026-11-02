const config = require('../config');
const { updateForumMessages } = require('../features/forum-list');

// ========================================
// フォーラム・スレッド一覧の自動更新
//
// 実行日時は config.js の forumList.schedule で設定（初期値: 毎週月曜 6:00）。
// ========================================

module.exports = {

    name: 'フォーラム一覧の更新',

    schedule: config.forumList.schedule,

    async run(client) {

        const result = await updateForumMessages(client);

        // 失敗したら例外にする → スケジューラーが時間をおいて再試行する
        if (!result.success) {
            throw new Error(result.reason);
        }

        return `フォーラム ${result.forumCount} 件 / メッセージ ${result.messageCount} 件`;
    },
};
