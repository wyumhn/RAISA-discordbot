// ========================================
// 入力されたチャンネル指定から ID を取り出す
//
// 次のどの形でも受け付ける:
//   1234567890                                         ID
//   https://discord.com/channels/サーバーID/チャンネルID      チャンネル / スレッドのリンク
//   https://discord.com/channels/サーバーID/チャンネルID/メッセージID  メッセージのリンク
//   <#1234567890>                                      チャンネルメンション
//
// ptb.discord.com / canary.discord.com / discordapp.com のリンクも可。
// 取り出せなければ null を返す。
// ========================================

function extractChannelId(input) {

    const text = (input ?? '').trim();

    // ID のみ
    if (/^\d{17,20}$/.test(text)) {
        return text;
    }

    // リンク（/channels/サーバーID/チャンネルID[/メッセージID]）
    const link = text.match(
        /^<?https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(?:\d+|@me)\/(\d+)(?:\/\d+)?\/?>?$/
    );

    if (link) {
        return link[1];
    }

    // <#ID>
    const mention = text.match(/^<#(\d+)>$/);

    if (mention) {
        return mention[1];
    }

    return null;
}

module.exports = {
    extractChannelId,
};
