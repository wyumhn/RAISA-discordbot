// ========================================
// メンションを無効化して `@名前` の形に置き換える
//
// 例: <@123> → `@たろう`、<@&456> → `@運営`、@everyone → `@everyone`
//
// ・名前がわからない場合は `<@123>` のように元の文字列をそのまま囲む
// ・コードブロック / インラインコードの中はもともとメンションにならないので触らない
// ・チャンネルリンク <#id> は通知されないのでそのまま残す
// ========================================

// コードブロック・インラインコードで分割する（奇数番目がコード部分）
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/;

const MENTION_PATTERN = /<@!?(\d+)>|<@&(\d+)>|@(everyone|here)/g;

// 名前にバッククォートが入っているとコード表示が崩れるので取り除く
function clean(name) {
    return name.replaceAll('`', '');
}

function resolveUserName(message, id) {

    const member =
        message.mentions.members?.get(id) ??
        message.guild?.members.cache.get(id);

    if (member) {
        return member.displayName;
    }

    const user =
        message.mentions.users.get(id) ??
        message.client.users.cache.get(id);

    return user ? (user.globalName || user.username) : null;
}

function resolveRoleName(message, id) {

    const role =
        message.mentions.roles.get(id) ??
        message.guild?.roles.cache.get(id);

    return role ? role.name : null;
}

function replaceMentionsInText(text, message, format) {

    return text.replace(MENTION_PATTERN, (match, userId, roleId, everyone) => {

        let name = null;

        if (userId) {
            name = resolveUserName(message, userId);
        } else if (roleId) {
            name = resolveRoleName(message, roleId);
        } else if (everyone) {
            name = everyone;
        }

        return format(name, match);
    });
}

// コード部分以外のメンションを format(名前, 元の文字列) の結果に置き換える
function replaceMentions(content, message, format) {

    if (!content) {
        return content;
    }

    return content
        .split(CODE_PATTERN)
        .map((part, index) =>
            index % 2 === 1 ? part : replaceMentionsInText(part, message, format)
        )
        .join('');
}

// 転送用: `@名前` の形にして通知・ハイライトされないようにする
function escapeMentions(content, message) {
    return replaceMentions(content, message, (name, raw) =>
        name ? `\`@${clean(name)}\`` : `\`${raw}\``
    );
}

// ログ用: 読みやすい @名前 のテキストにする
function mentionsToText(content, message) {
    return replaceMentions(content, message, (name, raw) =>
        name ? `@${name}` : raw
    );
}

module.exports = {
    escapeMentions,
    mentionsToText,
};
