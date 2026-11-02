const { Events, MessageFlags } = require('discord.js');

// ========================================
// スラッシュコマンドの振り分け
//
// commandName に対応する src/commands/*.js を呼ぶ。
//   ・実行時         → execute(interaction)
//   ・入力中の候補表示 → autocomplete(interaction)（定義されている場合）
// コマンド内で捕まえきれなかったエラーはここでまとめて応答する。
// ========================================

async function handleAutocomplete(interaction, command) {

    if (typeof command.autocomplete !== 'function') {
        return;
    }

    try {
        await command.autocomplete(interaction);
    } catch (error) {
        // 候補表示は入力のたびに呼ばれるので、失敗してもログだけ残す
        console.error(`/${interaction.commandName} 候補表示エラー:`, error);
    }
}

async function handleCommand(interaction, command) {

    console.log(
        `${interaction.user.tag} が /${interaction.commandName} を実行しました`
    );

    try {

        await command.execute(interaction);

    } catch (error) {

        console.error(`/${interaction.commandName} 実行エラー:`, error);

        const content =
            'コマンドの実行中にエラーが発生しました。\n' +
            `\`${error.message}\``;

        try {

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content });
            } else {
                await interaction.reply({
                    content,
                    flags: MessageFlags.Ephemeral,
                });
            }

        } catch (replyError) {
            console.error('エラー応答にも失敗しました:', replyError);
        }
    }
}

module.exports = {
    name: Events.InteractionCreate,

    async execute(interaction) {

        if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
            return;
        }

        const command =
            interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.warn(`未登録のコマンドです: /${interaction.commandName}`);
            return;
        }

        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction, command);
        } else {
            await handleCommand(interaction, command);
        }
    },
};
