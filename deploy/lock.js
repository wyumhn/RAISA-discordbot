const { tryAcquire, releaseUpdate, busyMessage } = require('../src/utils/busy');

// ========================================
// 更新スクリプト（deploy/update.sh）用のロック操作
//
//   node deploy/lock.js acquire <pid>  … 取れたら終了コード 0、使用中なら内容を表示して 1
//   node deploy/lock.js release <pid>
//
// <pid> は update.sh 自身のプロセスID。update.sh が終わればロックは無効になる。
// ========================================

const [action, pidText] = process.argv.slice(2);
const pid = Number(pidText);

if (!Number.isInteger(pid) || pid <= 0) {
    console.error('使い方: node deploy/lock.js acquire|release <pid>');
    process.exit(2);
}

if (action === 'acquire') {

    const lock = tryAcquire('更新（npm ci・再起動）', 'サーバー管理者', { owner: 'update', pid });

    if (lock.busy) {
        console.error(busyMessage(lock.busy));
        process.exit(1);
    }

} else if (action === 'release') {

    releaseUpdate(pid);

} else {
    console.error('使い方: node deploy/lock.js acquire|release <pid>');
    process.exit(2);
}
