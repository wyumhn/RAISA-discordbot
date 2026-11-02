const { Events } = require('discord.js');
const { registerCommands } = require('../registerCommands');
const { loadJobs } = require('../loader');
const { startJobs } = require('../scheduler');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {

        console.log(`${client.user.tag} 起動しました`);

        try {
            await registerCommands(client);
        } catch (error) {
            console.error('スラッシュコマンド登録エラー:', error);
        }

        // 定期実行（src/jobs/）を開始
        startJobs(client, loadJobs());
    },
};
