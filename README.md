# discord-bot

世界観用語 & シリーズ胡乱鯖 運営用の Discord Bot です。

- `/transfer` … 指定期間のメッセージを、元の名前・アイコンのまま別チャンネルへ転送
- `/export-log` … 指定期間のメッセージをテキストファイルに出力
- フォーラム・スレッド一覧の自動更新（毎週月曜 6:00）

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
├─ scheduler.js          毎週決まった日時にジョブを実行
│
├─ commands/             スラッシュコマンド
│   ├─ transfer.js        /transfer       指定期間のメッセージを転送
│   └─ export-log.js      /export-log     指定期間のメッセージをテキストファイルに出力
│
├─ jobs/                 定期実行
│   └─ forum-list.js      フォーラム・スレッド一覧の更新（毎週月曜 6:00）
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
│   │   └─ index.js        ファイルの組み立て（大きい場合は分割）
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
    └─ concurrency.js / guild.js / sleep.js

deploy/
└─ discord-bot.service   systemd の設定例

data/                    （自動作成）定期実行の前回実行日時
```
