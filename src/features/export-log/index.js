// チャンネルログのテキスト出力機能（/export-log から使用）

const { formatJst } = require('../../utils/datetime');
const { formatMessage, formatHeader } = require('./format');

// 1ファイルの上限。Discord の添付上限（ブーストなしで 10MB）より少し小さくする
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// 1メッセージに添付できるファイル数
const MAX_FILES = 10;

// ヘッダー用に確保しておくバイト数
const HEADER_RESERVE_BYTES = 1024;


// ファイル名に使えない文字を除く
function safeFileName(text) {
    return text.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50);
}

function compactDate(date) {
    return formatJst(date).replace(/[/:]/g, '').replace(' ', '-');
}


// ========================================
// メッセージ一覧 → 添付用ファイル一覧
//
// 大きすぎる場合はメッセージの区切りで複数ファイルに分割する。
// 戻り値: [{ attachment: Buffer, name: string }]
// ========================================

function buildLogFiles({ channel, messages, startDate, endDate }) {

    // メッセージごとの文字列を、上限サイズごとのまとまりに分ける
    const chunks = [[]];
    let currentBytes = 0;

    for (const message of messages) {

        const block = formatMessage(message) + '\n\n';
        const bytes = Buffer.byteLength(block, 'utf8');

        if (
            currentBytes + bytes > MAX_FILE_BYTES - HEADER_RESERVE_BYTES &&
            chunks[chunks.length - 1].length > 0
        ) {
            chunks.push([]);
            currentBytes = 0;
        }

        chunks[chunks.length - 1].push(block);
        currentBytes += bytes;
    }

    if (chunks.length > MAX_FILES) {
        throw new Error(
            `ログが大きすぎます（${chunks.length} ファイル分）。期間を短くして実行してください。`
        );
    }

    const baseName =
        `log_${safeFileName(channel.name ?? channel.id)}_` +
        `${compactDate(startDate)}_${compactDate(endDate)}`;

    return chunks.map((blocks, index) => {

        const header = formatHeader({
            channel,
            startDate,
            endDate,
            messageCount: messages.length,
            part: index + 1,
            totalParts: chunks.length,
        });

        const suffix = chunks.length > 1 ? `_part${index + 1}` : '';

        return {
            attachment: Buffer.from(header + blocks.join(''), 'utf8'),
            name: `${baseName}${suffix}.txt`,
        };
    });
}

module.exports = {
    buildLogFiles,
};
