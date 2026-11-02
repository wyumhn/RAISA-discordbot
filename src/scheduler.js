const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const { toJstParts, fromJstParts, formatJst } = require('./utils/datetime');

// ========================================
// 毎週・毎日決まった日時（日本時間）にジョブを実行する
//
// ・schedule に weekday があれば毎週その曜日、なければ毎日
//
// ・追加パッケージなしで setTimeout だけで動かす
// ・前回の実行日時をファイルに保存し、Bot が止まっていて
//   実行できなかった回があれば、起動時にすぐ1回実行する
// ・失敗したら時間をおいて再試行する
// ========================================

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const { retryDelayMs, maxRetries, stateFile } = config.jobs;


// ------------------------------------
// 前回の実行日時の保存・読み込み
// ------------------------------------

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
        return {};
    }
}

function saveLastRun(jobName, date) {
    try {
        const state = loadState();
        state[jobName] = { lastRunAt: date.toISOString() };
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('[定期実行] 実行日時の保存に失敗しました:', error.message);
    }
}


// ------------------------------------
// 日時の計算（日本時間）
// ------------------------------------

// 実行の間隔（weekday がなければ毎日）
function periodOf(schedule) {
    return schedule.weekday == null ? DAY_MS : WEEK_MS;
}

// now より後で、最も近い予定日時
function nextOccurrence(schedule, now = new Date()) {

    const { weekday, hour, minute } = schedule;

    const today = toJstParts(now);

    const daysAhead = weekday == null ? 0 : (weekday - today.weekday + 7) % 7;

    let candidate = new Date(
        fromJstParts(today.year, today.month, today.day, hour, minute).getTime() +
        daysAhead * DAY_MS
    );

    if (candidate <= now) {
        candidate = new Date(candidate.getTime() + periodOf(schedule));
    }

    return candidate;
}

// now 以前で、最も近い予定日時
function previousOccurrence(schedule, now = new Date()) {
    return new Date(nextOccurrence(schedule, now).getTime() - periodOf(schedule));
}


// ------------------------------------
// 実行
// ------------------------------------

const running = new Set();

async function runJob(job, client, attempt = 0) {

    if (running.has(job.name)) {
        console.log(`[定期実行] ${job.name}: 実行中のためスキップしました`);
        return;
    }

    running.add(job.name);

    console.log(`[定期実行] ${job.name}: 開始${attempt > 0 ? `（再試行 ${attempt}/${maxRetries}）` : ''}`);

    try {

        const summary = await job.run(client);

        saveLastRun(job.name, new Date());

        console.log(`[定期実行] ${job.name}: 完了${summary ? ` - ${summary}` : ''}`);

    } catch (error) {

        console.error(`[定期実行] ${job.name}: 失敗しました:`, error);

        if (attempt < maxRetries) {
            console.log(`[定期実行] ${job.name}: ${retryDelayMs / 60000} 分後に再試行します`);
            setTimeout(() => runJob(job, client, attempt + 1), retryDelayMs);
        } else {
            console.error(`[定期実行] ${job.name}: 再試行の上限に達したため、次回の予定まで待ちます`);
        }

    } finally {
        running.delete(job.name);
    }
}


// 1日・1週間先を setTimeout 1回で待つと、PC のスリープや時計の補正でずれることがあるため、
// 1分ごとに「予定時刻を過ぎたか」を確認する
const CHECK_INTERVAL_MS = 60 * 1000;

function scheduleNext(job, client) {

    const next = nextOccurrence(job.schedule);

    console.log(`[定期実行] ${job.name}: 次回 ${formatJst(next)}`);

    const timer = setInterval(async () => {

        if (Date.now() < next.getTime()) {
            return;
        }

        clearInterval(timer);

        await runJob(job, client);

        scheduleNext(job, client);

    }, CHECK_INTERVAL_MS);
}


// ========================================
// 起動時に呼ぶ
// ========================================

function startJobs(client, jobs) {

    const state = loadState();

    for (const job of jobs) {

        // 前回の予定日時より後に実行した記録がなければ、取り戻すため今すぐ実行
        const lastRunAt = state[job.name]?.lastRunAt
            ? new Date(state[job.name].lastRunAt)
            : null;

        const previous = previousOccurrence(job.schedule);

        if (!lastRunAt || lastRunAt < previous) {
            console.log(
                `[定期実行] ${job.name}: 前回の予定（${formatJst(previous)}）が未実行のため、今すぐ実行します`
            );
            runJob(job, client);
        }

        scheduleNext(job, client);
    }
}

module.exports = {
    startJobs,
    nextOccurrence,
    previousOccurrence,
};
