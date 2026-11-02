# discord-bot

世界観用語 & シリーズ胡乱鯖 運営用の Discord Bot です。

- `/transfer` … 指定期間のメッセージを、元の名前・アイコンのまま別チャンネルへ転送（運営用）
  - 添付ファイル（画像・音声など）は、アップロードし直さずリンクで貼ります
    元のメッセージを削除すると、転送先のリンクも見られなくなります
- `/export-log` … 指定期間のメッセージをテキストファイルに出力
  - 8MB を超える場合は、古い順に 8MB ごとのファイルに分けて、できた分からすぐ送ります
    （全件をメモリに溜めないため、メモリ使用量は件数に関係なくほぼ一定）。最大 30 ファイル
- フォーラム・スレッド一覧の自動更新（毎日 6:00）

## 起動

```sh
npm install
cp .env.example .env
npm start
```

## ファイル構成

```
src/
├─ index.js              entrypoint
├─ config.js             設定（.env の読み込み、実行日時・上限値など）
├─ loader.js             commands/・events/・jobs/ の自動読み込み
├─ registerCommands.js   スラッシュコマンドを Discord に登録
├─ scheduler.js          毎週・毎日決まった日時にジョブを実行
│
├─ commands/             スラッシュコマンド
│   ├─ transfer.js        /transfer       指定期間のメッセージを転送（運営用）
│   ├─ export-log.js      /export-log     指定期間のメッセージをテキストファイルに出力
│   ├─ busy-status.js     /busy-status    重い処理の実行状況を表示（運営用）
│   └─ busy-stop.js       /busy-stop      実行中の重い処理を中止（運営用）
│
├─ jobs/                 定期実行
│   └─ forum-list.js      フォーラム・スレッド一覧の更新（毎日 6:00）
│
├─ events/               Discord のイベント
│   ├─ clientReady.js     起動時（コマンド登録・定期実行の開始）
│   └─ interactionCreate.js  コマンドの振り分け・共通エラー処理
│
├─ features/             機能の本体
│   ├─ transfer/          メッセージ転送
│   │   ├─ fetch.js        期間内のメッセージ取得
│   │   ├─ webhook.js      転送用 Webhook の取得・作成
│   │   ├─ send.js         1件ずつの転送処理
│   │   └─ mentions.js     メンションを平文に置き換える
│   ├─ export-log/        ログのテキスト出力
│   │   ├─ format.js       1メッセージ分のテキスト整形
│   │   └─ index.js        古い順に取得しながら 8MB ごとのファイルにして送る
│   └─ forum-list/        フォーラム・スレッド一覧
│       ├─ collect.js      フォーラム・スレッドの収集と行の生成
│       ├─ paginate.js     2000文字・100メッセージへの分割
│       └─ sync.js         一覧チャンネルの既存メッセージを編集・追加・削除
│
└─ utils/                汎用ヘルパー
    ├─ permissions.js     実行者の権限チェック
    ├─ reporter.js        進捗表示と結果通知
    ├─ channelInput.js    ID・リンクからチャンネルIDを取り出す
    ├─ datetime.js        日本時間の日時解析・表示
    ├─ busy.js            重い処理を同時に1つだけにする
    └─ concurrency.js / guild.js / sleep.js

deploy/
├─ discord-bot.service   systemd の設定例
├─ update.sh             更新（git pull → npm ci → 再起動）
└─ lock.js               update.sh が使うロック操作

data/                    （自動作成）定期実行の前回実行日時・実行中の重い処理
```

## 重い処理の同時実行の制限

次の処理はメモリを多く使うため、**同時に1つだけ**しか実行できません。
実行中に別のものを始めようとすると、開始前に止めて「〇〇を実行中」と返します。

- `/transfer`
- `/export-log`（メッセージが 3000 件を超えるとき。件数は `src/config.js` の `busy.exportLogHeavyMessages`）
  - 件数は取得してみるまで分からないため、取得中に 3000 件を超えた時点で確認し、
    他の処理が実行中ならそこで止めます
- サーバーでの更新（`deploy/update.sh` の `npm ci`・再起動）

サーバーの更新は、sudo できるユーザーで次を実行します。
`/transfer` などが実行中なら、何もせずに中止します。

```sh
bash /home/bot/discord-bot/deploy/update.sh
```

### 状況の確認・中止（運営用コマンド）

- `/busy-status` … 実行中の処理・実行者・開始日時・状態を表示します
- `/busy-stop` … 実行中の `/transfer`・`/export-log` に中止を要求します。
  処理中のメッセージ1件が終わったところで止まり、実行者に「中止しました」と結果が届きます
  - 実際には動いていない古いロックは、そのまま解除します
  - サーバーの更新（`update.sh`）は Bot からは止められません
  - `force: True` … 止まらないときに、ロックを強制的に解除します

`/transfer` と、これらの運営用コマンドは、初期状態では「サーバー管理」権限を持つ人だけが使えます。
使えるロール・メンバーは、サーバー設定 > 連携サービス > この Bot から変更できます。

### Docker での起動

```sh
docker build -t discord-bot .
docker run -d --name discord-bot --restart unless-stopped --env-file .env -v discord-bot-data:/app/data discord-bot
```
