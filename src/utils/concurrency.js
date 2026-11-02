// ========================================
// 並列処理ヘルパー
//
// items を最大 concurrency 件まで同時に asyncFn で処理する。
// 結果は items と同じ順番で返す。
// ========================================

async function mapWithConcurrency(items, concurrency, asyncFn) {

    const results = new Array(items.length);

    let nextIndex = 0;

    async function worker() {

        while (true) {

            const index = nextIndex++;

            if (index >= items.length) {
                return;
            }

            results[index] = await asyncFn(items[index], index);
        }
    }

    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
        Array.from({ length: workerCount }, () => worker())
    );

    return results;
}

module.exports = {
    mapWithConcurrency,
};
