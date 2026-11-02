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

// ========================================
// 期間内のメッセージを古い順に少しずつ取り出す（/export-log 用）
//
// fetchMessagesInRange は全件をメモリに溜めてから返すが、こちらは
// 100件ずつ古い順に返すので、使い終わったメッセージから捨てられる。
//
//   for await (const batch of iterateMessagesInRange(...)) { ... }
//
// 「開始日時の直前」に相当するIDから、新しい方向（after）へ読み進める。
// ========================================

async function* iterateMessagesInRange(channel, startDate, endDate) {

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    // 開始日時ちょうどの投稿も含めるため -1
    let after = (BigInt(snowflakeFromTimestamp(startTime)) - 1n).toString();

    while (true) {

        const batch = await channel.messages.fetch({ limit: 100, after, cache: false });

        if (batch.size === 0) {
            return;
        }

        const sorted = [...batch.values()].sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp
        );

        const inRange = sorted.filter(message => message.createdTimestamp <= endTime);

        if (inRange.length > 0) {
            yield inRange;
        }

        // 終了日時を過ぎた / これ以上ない
        if (inRange.length < sorted.length || batch.size < 100) {
            return;
        }

        after = sorted[sorted.length - 1].id;
    }
}

module.exports = {
    fetchMessagesInRange,
    iterateMessagesInRange,
    snowflakeFromTimestamp,
};
