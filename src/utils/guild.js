const config = require('../config');

// ========================================
// 対象サーバーを取得
//
// GUILD_ID が設定されていればそのサーバー。
// 未設定の場合は、Bot が参加しているサーバーが1つだけならそれを使う。
// 複数のサーバーに参加しているのに未設定だと、どれが対象か決められないため
// null を返す（呼び出し側でエラーにする）。
// ========================================

let warned = false;

async function getGuild(client) {

    if (config.guildId) {
        return client.guilds.fetch(config.guildId);
    }

    if (client.guilds.cache.size > 1) {

        if (!warned) {
            console.error(
                'Bot が複数のサーバーに参加していますが、.env に GUILD_ID が設定されていません。' +
                '対象サーバーのIDを GUILD_ID に設定してください。'
            );
            warned = true;
        }

        return null;
    }

    return client.guilds.cache.first() ?? null;
}

module.exports = {
    getGuild,
};
