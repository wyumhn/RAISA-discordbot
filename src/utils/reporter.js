const { MessageFlags } = require('discord.js');

// ========================================
// 長い処理の進捗・結果を実行者に伝える
//
// コマンドへの返信（editReply）はコマンド実行から15分しか使えない。
// そのため:
//   ・進捗は返信を数秒おきに書き換えて表示（15分が近づいたら止める）
//   ・最終結果は、間に合えば返信に、間に合わなければ
//     実行者への DM → だめなら実行したチャンネルにメンション付きで送る
// ========================================

// 返信が使える時間（15分）から余裕を1分取る
const REPLY_LIFETIME_MS = 14 * 60 * 1000;

// 進捗表示を書き換える最短間隔
const PROGRESS_INTERVAL_MS = 3000;


function createReporter(interaction) {

    let lastProgressAt = 0;

    const canEditReply = () =>
        Date.now() - interaction.createdTimestamp < REPLY_LIFETIME_MS;


    // 進捗（失敗しても処理は続ける）
    async function progress(content, { force = false } = {}) {

        if (!canEditReply()) {
            return;
        }

        if (!force && Date.now() - lastProgressAt < PROGRESS_INTERVAL_MS) {
            return;
        }

        lastProgressAt = Date.now();

        try {
            await interaction.editReply(content);
        } catch (error) {
            console.error('進捗の表示に失敗しました:', error.message);
        }
    }


    // 最終結果（payload は文字列か { content, files }）
    async function finish(payload) {

        const message = typeof payload === 'string' ? { content: payload } : payload;

        if (canEditReply()) {
            try {
                await interaction.editReply(message);
                return;
            } catch (error) {
                console.error('結果の返信に失敗しました:', error.message);
            }
        }

        await deliver(message);
    }


    // 途中経過として別のメッセージを送る（分割したファイルなど）
    // 返信の時間内なら、実行者にだけ見える追加の返信（followUp）で送る
    async function send(payload) {

        const message = typeof payload === 'string' ? { content: payload } : payload;

        if (canEditReply()) {
            try {
                await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral });
                return;
            } catch (error) {
                console.error('追加の返信に失敗しました:', error.message);
            }
        }

        await deliver(message);
    }


    // 返信が使えないとき: DM → だめなら実行したチャンネルにメンション付きで送る
    async function deliver(message) {

        const title = `/${interaction.commandName} の結果`;

        // DM
        try {
            await interaction.user.send({
                ...message,
                content: `**${title}**\n${message.content}`,
            });
            return;
        } catch (error) {
            console.error('結果の DM 送信に失敗しました:', error.message);
        }

        // 実行したチャンネル
        try {
            await interaction.channel?.send({
                ...message,
                content: `${interaction.user} ${title}\n${message.content}`,
                allowedMentions: { users: [interaction.user.id] },
            });
        } catch (error) {
            console.error('結果の送信にすべて失敗しました:', error.message);
        }
    }

    return {
        progress,
        send,
        finish,
    };
}

module.exports = {
    createReporter,
};
