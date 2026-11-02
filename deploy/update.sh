#!/usr/bin/env bash
# ========================================
# Bot の更新（git pull → npm ci → 再起動）
#
# sudo できるユーザーで実行:
#   bash /home/bot/discord-bot/deploy/update.sh
#
# /transfer などの重い処理が実行中なら、何もせずに中止する。
# 更新中は Bot 側でも重い処理を始めない（data/busy.lock で共有）。
# ========================================

set -euo pipefail

APP_DIR=/home/bot/discord-bot
APP_USER=bot
SERVICE=discord-bot

# Bot 専用ユーザーとして、アプリのフォルダでコマンドを実行
as_bot() {
    sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $1"
}

# git pull でこのファイル自体が書き換わっても影響しないよう、
# 全体を関数にして先に読み込ませてから実行する
main() {

    if ! as_bot "node deploy/lock.js acquire $$"; then
        echo '更新を中止しました。処理が終わってから、もう一度実行してください。' >&2
        exit 1
    fi

    trap 'as_bot "node deploy/lock.js release $$"' EXIT

    as_bot 'git pull --ff-only'
    as_bot 'npm ci --omit=dev'

    sudo systemctl restart "$SERVICE"

    echo "更新が完了しました。ログ: journalctl -u $SERVICE -f"
}

main "$@"
exit
