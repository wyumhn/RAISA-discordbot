const { getGuild } = require('./utils/guild');

// ========================================
// スラッシュコマンド登録
//
// client.commands にあるコマンドを、対象サーバーにまとめて登録する。
// set() は「丸ごと置き換え」なので、commands/ から消したコマンドは
// Discord 側からも消える。
//
// サーバー単位の登録は即時反映される（グローバル登録は反映が遅い）。
// ========================================

async function registerCommands(client) {

    const guild = await getGuild(client);

    if (!guild) {
        console.error('サーバーが見つかりません');
        return;
    }

    const body = client.commands.map(command => command.data.toJSON());

    await guild.commands.set(body);

    // 旧実装では /transfer をグローバル登録していたため、
    // サーバー側と二重に表示されないようグローバルコマンドは空にする。
    await client.application.commands.set([]);

    console.log(
        `スラッシュコマンドを登録しました（${guild.name}）: ` +
        body.map(command => `/${command.name}`).join(', ')
    );
}

module.exports = {
    registerCommands,
};
