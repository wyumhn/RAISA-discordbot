const config = require('../../config');

const { maxMessages, maxMessageLength } = config.forumList;


// ========================================
// 行を maxMessageLength 文字以内のメッセージにまとめる
// ========================================

function splitMessages(lines) {

    const messages = [];

    let current = '';

    for (const line of lines) {

        const next = current === '' ? line : `${current}\n${line}`;

        if (next.length > maxMessageLength) {

            if (current !== '') {
                messages.push(current);
            }

            current = line;

        } else {
            current = next;
        }
    }

    if (current !== '') {
        messages.push(current);
    }

    return messages;
}


// ========================================
// maxMessages 件になるようメッセージを分割して増やす
//
// 後からスレッドが増えたときに、既存メッセージの編集だけで
// 済むよう、あらかじめ枠を確保しておくための処理。
//
// ・空行を単独のメッセージにしない
// ・末尾の空行を維持
// ・各メッセージは maxMessageLength 文字以内
// ========================================

function splitOnce(messages) {

    for (let i = 0; i < messages.length; i++) {

        const lines = messages[i].split('\n');

        // 末尾の空行を数える
        let trailingEmptyLines = 0;

        for (let j = lines.length - 1; j >= 0 && lines[j] === ''; j--) {
            trailingEmptyLines++;
        }

        const nonEmptyLineCount = lines.length - trailingEmptyLines;

        // 実データが1行しかなければ分割不可
        if (nonEmptyLineCount < 2) {
            continue;
        }

        // 最後の実データ行で分割
        const splitIndex = nonEmptyLineCount - 1;

        const firstPart = lines.slice(0, splitIndex).join('\n');

        // 最後の実データ行 + 元の末尾空行
        const secondPart = lines.slice(splitIndex).join('\n');

        if (
            firstPart.length === 0 ||
            secondPart.trim() === '' ||
            firstPart.length > maxMessageLength ||
            secondPart.length > maxMessageLength
        ) {
            continue;
        }

        messages.splice(i, 1, firstPart, secondPart);

        return true;
    }

    return false;
}

function adjustToMaxMessages(messages) {

    while (messages.length < maxMessages) {

        if (!splitOnce(messages)) {
            break;
        }
    }

    return messages;
}


// ========================================
// 行 → 送信用メッセージ配列
// ========================================

function paginate(lines) {

    let messages = splitMessages(lines);

    console.log(`通常分割後: ${messages.length} メッセージ`);

    messages = adjustToMaxMessages(messages);

    // 空メッセージを除去
    messages = messages.filter(message => message && message.trim().length > 0);

    console.log(`微調整後: ${messages.length} メッセージ`);

    return messages;
}

module.exports = {
    paginate,
};
