const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { formatJst } = require('./datetime');

// ========================================
// 重い処理を同時に1つだけにする
//
// /transfer・範囲の大きい /export-log・更新（deploy/update.sh の npm ci）は
// どれもメモリを多く使うため、実行中のものがあれば新しく始めない。
//
// 更新スクリプトは別プロセスなので、ファイル（data/busy.lock）で共有する。
// 中身: { task, by, owner: 'bot' | 'update', pid, startedAt }
// ========================================

const { lockFile, updateMaxAgeMs } = config.busy;

// 書き込み途中のファイルを読んだ可能性があるため、読めなくてもしばらくは有効とみなす
const UNREADABLE_GRACE_MS = 10 * 1000;

// この Bot で実行中の重い処理（/busy-stop で中止するため）
// { info, controller }
let running = null;


function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // 別ユーザーのプロセス（更新スクリプト）は EPERM になるが、生きている
        return error.code === 'EPERM';
    }
}

function readLock() {
    try {
        return JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    } catch {
        return null;
    }
}


// ------------------------------------
// 残っているロックが古い（もう誰も使っていない）か
//
// fromBot: Bot のプロセスから確認しているか
//   Bot は1つしか動かないので、自分以外の Bot が持つロックは
//   再起動前の残り物（pid が再利用されていても判定できる）
// ------------------------------------

function isStale(lock, { fromBot }) {

    if (!lock) {
        try {
            return Date.now() - fs.statSync(lockFile).mtimeMs > UNREADABLE_GRACE_MS;
        } catch {
            return true;
        }
    }

    if (lock.owner === 'bot') {
        return fromBot ? lock.pid !== process.pid : !isAlive(lock.pid);
    }

    // 更新スクリプトは途中で止まっても長く残らないよう、時間でも切る
    return !isAlive(lock.pid) || Date.now() - Date.parse(lock.startedAt) > updateMaxAgeMs;
}


// ========================================
// ロックを取る
//
// 戻り値:
//   取れた   → { release(), signal }
//              … 処理が終わったら必ず release() を呼ぶ
//              … signal は /busy-stop で中止されると aborted になる。
//                 処理のループで signal.aborted を確認して止まる
//   使用中   → { busy: 実行中の処理の情報 }
// ========================================

function tryAcquire(task, by, { owner = 'bot', pid = process.pid } = {}) {

    fs.mkdirSync(path.dirname(lockFile), { recursive: true });

    const info = {
        task,
        by,
        owner,
        pid,
        startedAt: new Date().toISOString(),
    };

    // 古いロックを消したあとにもう1回だけ試す
    for (let attempt = 0; attempt < 2; attempt++) {

        try {
            // wx: ファイルが既にあれば失敗する（取り合いになっても片方だけが成功する）
            fs.writeFileSync(lockFile, JSON.stringify(info, null, 2), { flag: 'wx' });

            const controller = new AbortController();

            if (owner === 'bot') {
                running = { info, controller };
            }

            return {
                release: () => release(info),
                signal: controller.signal,
            };
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }

        const current = readLock();

        if (!isStale(current, { fromBot: owner === 'bot' })) {
            return { busy: current ?? { task: '不明な処理' } };
        }

        console.warn('[busy] 古いロックを削除しました:', current);
        fs.rmSync(lockFile, { force: true });
    }

    return { busy: readLock() ?? { task: '不明な処理' } };
}


// 自分のロックのときだけ消す（他の処理のロックを消さない）
function release(info) {

    if (running?.info === info) {
        running = null;
    }

    const current = readLock();

    if (current && current.pid === info.pid && current.startedAt === info.startedAt) {
        fs.rmSync(lockFile, { force: true });
    }
}


// 更新スクリプトのロックを消す（deploy/lock.js から使う）
function releaseUpdate(pid) {

    const current = readLock();

    if (current && current.owner === 'update' && current.pid === pid) {
        fs.rmSync(lockFile, { force: true });
    }
}


// ========================================
// 現在の状況（/busy-status・/busy-stop から使う）
//
// 戻り値:
//   ロックなし → null
//   ロックあり → {
//       lock,      … ファイルの中身（読めなければ null）
//       stale,     … 古いロック（もう誰も使っていない）か
//       mine,      … この Bot で実行中の処理か（中止できる）
//       stopping,  … 中止を要求済みか
//   }
// ========================================

function getStatus() {

    if (!fs.existsSync(lockFile)) {
        return null;
    }

    const lock = readLock();

    const mine = Boolean(
        running && lock &&
        lock.pid === running.info.pid &&
        lock.startedAt === running.info.startedAt
    );

    return {
        lock,
        stale: isStale(lock, { fromBot: true }),
        mine,
        stopping: mine && running.controller.signal.aborted,
    };
}


// この Bot で実行中の処理に中止を要求する（止まったら処理側が release する）
function requestStop(by) {

    if (!running) {
        return false;
    }

    running.controller.abort(new Error(`${by} が /busy-stop で中止しました`));

    return true;
}


// ロックファイルを強制的に消す（処理が固まって止まらないときの最終手段）
// 実行中の処理があれば中止も要求する
function forceUnlock(by) {

    requestStop(by);

    running = null;

    fs.rmSync(lockFile, { force: true });
}


// 使用中のときに実行者へ返す文
function busyMessage(busy) {

    const detail = [
        busy.by,
        busy.startedAt ? `${formatJst(new Date(busy.startedAt))} 開始` : null,
    ].filter(Boolean).join('、');

    return (
        `現在「${busy.task}」${detail ? `（${detail}）` : ''}を実行中のため、開始できませんでした。\n` +
        '終わってから、もう一度実行してください。'
    );
}

module.exports = {
    tryAcquire,
    releaseUpdate,
    getStatus,
    requestStop,
    forceUnlock,
    busyMessage,
};
