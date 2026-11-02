const path = require('node:path');

// ========================================
// .env の読み込み
//
// Node.js 20.12 以降の process.loadEnvFile を使用（追加パッケージ不要）。
// .env が無い場合は、OS の環境変数をそのまま使う。
// ========================================

const ENV_PATH = path.join(__dirname, '..', '.env');

if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile(ENV_PATH);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

function requireEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `環境変数 ${name} が設定されていません。` +
            '.env.example を参考に .env を作成してください。'
        );
    }

    return value;
}

// カンマ区切りの ID 一覧（未設定・空なら空配列）
function listEnv(name) {
    return (process.env[name] || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
}


// ========================================
// 設定
// ========================================

module.exports = {

    // Bot トークン（.env の DISCORD_TOKEN）
    token: requireEnv('DISCORD_TOKEN'),

    // コマンド登録・フォーラム一覧の対象サーバー。
    // 未設定の場合、Bot が参加しているサーバーが1つだけならそれを使う。
    guildId: process.env.GUILD_ID || null,


    // ------------------------------------
    // フォーラム・スレッド一覧（毎週自動で更新）
    // ------------------------------------
    forumList: {

        // 自動更新の日時（日本時間）
        // weekday: 0=日 1=月 2=火 3=水 4=木 5=金 6=土
        schedule: {
            weekday: 1,
            hour: 6,
            minute: 0,
        },

        // 一覧を書き込むチャンネル（.env の FORUM_LIST_CHANNEL_ID）
        channelId: requireEnv('FORUM_LIST_CHANNEL_ID'),

        // このロールに投稿権限があるフォーラムだけを一覧に載せる（.env の FORUM_LIST_ROLE_ID）
        targetRoleId: requireEnv('FORUM_LIST_ROLE_ID'),

        // 一覧から除外するカテゴリー（.env の FORUM_LIST_EXCLUDED_CATEGORY_IDS）
        // カテゴリーに入っていないフォーラム（null）は常に除外する
        excludedCategoryIds: [
            null,
            ...listEnv('FORUM_LIST_EXCLUDED_CATEGORY_IDS'),
        ],

        // 一覧に使う最大メッセージ数
        maxMessages: 100,

        // 1メッセージの最大文字数（Discord の上限）
        maxMessageLength: 2000,

        // 同時に実行する Discord API 処理数。
        // 大きくしすぎると Rate Limit にかかりやすくなる。
        apiConcurrency: 5,
    },


    // ------------------------------------
    // /transfer（メッセージ転送）
    // ------------------------------------
    transfer: {

        // 転送用に作成する Webhook の名前
        webhookName: 'Message Transfer',

        // 1件転送するごとの待機時間（Rate Limit 対策）
        delayMs: 300,
    },


    // ------------------------------------
    // 定期実行（src/jobs/）
    // ------------------------------------
    jobs: {

        // 失敗したときの再試行（間隔と回数）
        retryDelayMs: 30 * 60 * 1000,
        maxRetries: 3,

        // 前回の実行日時を保存するファイル
        // （Bot が止まっていて実行できなかった分を、起動時に取り戻すため）
        stateFile: path.join(__dirname, '..', 'data', 'job-state.json'),
    },


    // ------------------------------------
    // 重い処理の同時実行の制限（src/utils/busy.js）
    //
    // /transfer・範囲の大きい /export-log・更新（deploy/update.sh）は
    // 同時に1つだけ。実行中に別のものを始めようとすると止める。
    // ------------------------------------
    busy: {

        // /export-log は取得したメッセージがこの件数を超えたときだけ制限の対象にする
        exportLogHeavyMessages: 3000,

        // 更新スクリプトのロックをこれより古ければ無効とみなす
        updateMaxAgeMs: 30 * 60 * 1000,

        // 実行中の処理を記録するファイル（更新スクリプトと共有）
        lockFile: path.join(__dirname, '..', 'data', 'busy.lock'),
    },
};
