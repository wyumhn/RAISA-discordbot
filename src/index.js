const { Client, GatewayIntentBits } = require('discord.js');

const config = require('./config');
const { loadCommands, loadEvents } = require('./loader');

// ========================================
// エントリーポイント
//
// Client はここで1つだけ作成する。
// コマンドは src/commands/、イベントは src/events/ から自動で読み込む。
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = loadCommands();
loadEvents(client);

// discord.js 内部のエラー（接続の一時的な切断など）を記録する
client.on('error', error => {
    console.error('[discord.js] エラー:', error);
});


// ========================================
// 想定外のエラー
//
// ・Promise の失敗（unhandledRejection）は記録して動作を続ける
// ・同期的な例外（uncaughtException）は状態が壊れている可能性があるため、
//   記録して終了する → systemd / pm2 が自動で再起動する
// ========================================

process.on('unhandledRejection', error => {
    console.error('[unhandledRejection]', error);
});

process.on('uncaughtException', error => {
    console.error('[uncaughtException] 終了します:', error);
    shutdown(1);
});


// ========================================
// 停止処理
//
// systemctl stop や Ctrl+C のときに Discord から正しく切断する。
// ========================================

let shuttingDown = false;

async function shutdown(exitCode = 0) {

    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log('Bot を停止しています……');

    // 切断が終わらない場合でも 10 秒で強制終了
    setTimeout(() => process.exit(exitCode), 10_000).unref();

    try {
        await client.destroy();
    } catch (error) {
        console.error('切断中にエラーが発生しました:', error);
    }

    process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));


// トークン間違いなどでログインできない場合は、エラーを表示して終了する
client.login(config.token).catch(error => {
    console.error('Discord へのログインに失敗しました。DISCORD_TOKEN を確認してください:', error.message);
    process.exit(1);
});
