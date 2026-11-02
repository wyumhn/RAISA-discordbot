// チャンネルログのテキスト出力機能（/export-log から使用）

const { formatJst } = require('../../utils/datetime');
const { iterateMessagesInRange } = require('../transfer/fetch');
const { formatMessage, formatHeader } = require('./format');

// 1ファイルの上限。Discord の添付上限（ブーストなしで 10MB）より少し小さくする
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// 送るファイル数の上限（大きすぎる期間で大量に送り続けないため）
const MAX_PARTS = 30;

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
// メッセージを古い順に取得しながら、ファイルにして送る
//
// メモリを節約するため、全件を溜めてから作るのではなく:
//   ・取得したメッセージはすぐ文字列にして捨てる
//   ・1ファイル分（8MB）たまったら、その場で sendPart で送って捨てる
// 全体が1ファイルに収まった場合だけは送らずに返す（結果の返信に添付するため）。
//
// options:
//   onProgress(件数)    … 100件取得するごとに呼ばれる（throw すると中止）
//   sendPart(file, n)   … n 個目のファイルを送る
//
// 戻り値: { count, parts, lastFile }
//   lastFile … 1ファイルに収まったときのファイル（それ以外は null）
// ========================================

async function exportLog({ channel, startDate, endDate, onProgress, sendPart }) {

    const baseName =
        `log_${safeFileName(channel.name ?? channel.id)}_` +
        `${compactDate(startDate)}_${compactDate(endDate)}`;

    let blocks = [];
    let blockCount = 0;
    let currentBytes = 0;

    let count = 0;
    let parts = 0;

    function buildFile(part) {

        const header = formatHeader({
            channel,
            startDate,
            endDate,
            messageCount: blockCount,
            part,
        });

        const suffix = part ? `_part${part}` : '';

        return {
            attachment: Buffer.from(header + blocks.join(''), 'utf8'),
            name: `${baseName}${suffix}.txt`,
        };
    }

    // 1ファイル分を送って、手元から捨てる
    async function flush() {

        parts++;

        if (parts > MAX_PARTS) {
            throw new Error(
                `ファイルが ${MAX_PARTS} 個を超えたため、途中で打ち切りました。` +
                '残りは期間を分けて実行してください。'
            );
        }

        const file = buildFile(parts);

        blocks = [];
        blockCount = 0;
        currentBytes = 0;

        await sendPart(file, parts);
    }

    for await (const batch of iterateMessagesInRange(channel, startDate, endDate)) {

        for (const message of batch) {

            const block = formatMessage(message) + '\n\n';
            const bytes = Buffer.byteLength(block, 'utf8');

            if (currentBytes + bytes > MAX_FILE_BYTES - HEADER_RESERVE_BYTES && blocks.length > 0) {
                await flush();
            }

            blocks.push(block);
            blockCount++;
            currentBytes += bytes;
            count++;
        }

        await onProgress?.(count);
    }

    if (blocks.length === 0) {
        return { count, parts, lastFile: null };
    }

    // まだ1つも送っていない → 1ファイルに収まったので、呼び出し元で結果と一緒に送る
    if (parts === 0) {
        return { count, parts: 1, lastFile: buildFile(null) };
    }

    await flush();

    return { count, parts, lastFile: null };
}

module.exports = {
    exportLog,
};
