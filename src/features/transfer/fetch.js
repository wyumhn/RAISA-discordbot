// ========================================
// 期間内のメッセージを取得
//
// Discord のメッセージIDには投稿時刻が含まれているので、
// 「終了日時の直後」に相当するIDを作り、そこから過去へ100件ずつ遡る。
// これで終了日時より新しいメッセージを読まずに済む。
// 開始日時より前に達したら終了。
//
// onProgress(取得済み件数) を渡すと、100件読むごとに呼ばれる。
// 戻り値は古い → 新しい順。
// ========================================

// Discord のID計算の基準時刻（2015-01-01T00:00:00Z）
const DISCORD_EPOCH = 1420070400000n;

// この時刻より前に投稿されたメッセージは、必ずこのIDより小さい
function snowflakeFromTimestamp(timestamp) {
    return ((BigInt(timestamp) - DISCORD_EPOCH) << 22n).toString();
}

async function fetchMessagesInRange(channel, startDate, endDate, { onProgress } = {}) {

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const messages = [];

    // 終了日時ちょうどの投稿も含めるため +1ms
    let before = snowflakeFromTimestamp(endTime + 1);

    let scanned = 0;

    while (true) {

        const batch = await channel.messages.fetch({ limit: 100, before, cache: false });

        if (batch.size === 0) {
            break;
        }

        scanned += batch.size;

        for (const message of batch.values()) {

            const timestamp = message.createdTimestamp;

            if (timestamp >= startTime && timestamp <= endTime) {
                messages.push(message);
            }
        }

        // 今回取得した中で最も古いメッセージ
        const oldest = batch.last();

        before = oldest.id;

        await onProgress?.(messages.length, scanned);

        // 開始日時より前まで遡った / これ以上ない
        if (oldest.createdTimestamp < startTime || batch.size < 100) {
            break;
        }
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    return messages;
}

module.exports = {
    fetchMessagesInRange,
    snowflakeFromTimestamp,
};
