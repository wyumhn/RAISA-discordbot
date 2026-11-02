const { ChannelType, PermissionFlagsBits } = require('discord.js');

// ========================================
// コマンドを実行した人の権限でチャンネルを使えるか確認する
//
// Bot は多くのチャンネルを見られるため、Bot の権限だけで処理すると
// 実行者が見られない非公開チャンネルのログを取り出せてしまう。
// それを防ぐため、実行者本人の権限を確認する。
//
// 「存在しない」と「見る権限がない」は同じメッセージにして、
// 非公開チャンネルの存在が分からないようにする。
// ========================================

const NOT_FOUND = '指定したチャンネルが見つからないか、あなたに閲覧する権限がありません。';


// チャンネルを取得（取得できなければ null）
async function fetchChannelSafe(client, channelId) {
    try {
        return await client.channels.fetch(channelId);
    } catch {
        return null;
    }
}


// プライベートスレッドは、参加者かスレッド管理権限を持つ人しか見られない
async function canSeePrivateThread(channel, userId, permissions) {

    if (channel.type !== ChannelType.PrivateThread) {
        return true;
    }

    if (permissions.has(PermissionFlagsBits.ManageThreads)) {
        return true;
    }

    try {
        await channel.members.fetch(userId);
        return true;
    } catch {
        return false;
    }
}


// ========================================
// 実行者がチャンネルを使えるか確認して取得する
//
// mode:
//   'read'  … 閲覧 + メッセージ履歴の閲覧（転送元・ログ出力元）
//   'write' … 閲覧 + 送信（転送先）
//
// 戻り値: { channel } または { error: 返信用メッセージ }
// ========================================

async function resolveChannelForMember(interaction, channelId, mode, label) {

    const channel = await fetchChannelSafe(interaction.client, channelId);

    // 別サーバーのチャンネルは指定できない
    if (!channel || channel.guildId !== interaction.guildId) {
        return { error: `${label}: ${NOT_FOUND}` };
    }

    const permissions = channel.permissionsFor(interaction.member);

    if (
        !permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !(await canSeePrivateThread(channel, interaction.user.id, permissions))
    ) {
        return { error: `${label}: ${NOT_FOUND}` };
    }

    if (!channel.isTextBased()) {
        return { error: `${label}: テキストチャンネル / スレッドではありません。` };
    }

    if (mode === 'read' && !permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
        return { error: `${label}: あなたにはメッセージ履歴を閲覧する権限がありません。` };
    }

    if (mode === 'write') {

        const sendPermission = channel.isThread()
            ? PermissionFlagsBits.SendMessagesInThreads
            : PermissionFlagsBits.SendMessages;

        if (!permissions.has(sendPermission)) {
            return { error: `${label}: あなたにはメッセージを送信する権限がありません。` };
        }
    }

    return { channel };
}

module.exports = {
    resolveChannelForMember,
};
