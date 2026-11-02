const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

function listJsFiles(dir) {
    return fs
        .readdirSync(dir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
}


// ========================================
// src/commands/*.js を読み込む
//
// 各ファイルは次の形で export する:
//   module.exports = {
//       data: new SlashCommandBuilder()...,
//       async execute(interaction) { ... },
//   };
// ========================================

function loadCommands() {

    const commands = new Collection();

    for (const file of listJsFiles(path.join(__dirname, 'commands'))) {

        const command = require(file);

        if (!command.data || typeof command.execute !== 'function') {
            console.warn(
                `[警告] ${path.basename(file)} に data または execute がないため読み込みませんでした`
            );
            continue;
        }

        const name = command.data.name;

        if (commands.has(name)) {
            throw new Error(`コマンド名が重複しています: /${name}`);
        }

        commands.set(name, command);
    }

    return commands;
}


// ========================================
// src/events/*.js を読み込む
//
// 各ファイルは次の形で export する:
//   module.exports = {
//       name: Events.XXX,
//       once: true,        // 1回だけ実行する場合
//       async execute(...args) { ... },
//   };
// ========================================

function loadEvents(client) {

    for (const file of listJsFiles(path.join(__dirname, 'events'))) {

        const event = require(file);

        const handler = (...args) => event.execute(...args);

        if (event.once) {
            client.once(event.name, handler);
        } else {
            client.on(event.name, handler);
        }
    }
}

// ========================================
// src/jobs/*.js を読み込む（定期実行）
//
// 各ファイルは次の形で export する:
//   module.exports = {
//       name: 'ジョブ名',
//       schedule: { weekday: 1, hour: 6, minute: 0 },  // 日本時間（weekday 省略で毎日）
//       async run(client) { ... },  // 失敗時は throw
//   };
// ========================================

function loadJobs() {

    const jobs = [];

    for (const file of listJsFiles(path.join(__dirname, 'jobs'))) {

        const job = require(file);

        if (!job.name || !job.schedule || typeof job.run !== 'function') {
            console.warn(
                `[警告] ${path.basename(file)} に name / schedule / run がないため読み込みませんでした`
            );
            continue;
        }

        jobs.push(job);
    }

    return jobs;
}

module.exports = {
    loadCommands,
    loadEvents,
    loadJobs,
};
