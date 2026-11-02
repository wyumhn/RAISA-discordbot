const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const { getStatus, requestStop, forceUnlock } = require('../utils/busy');
const { describeStatus } = require('./busy-status');

// ========================================
// 実行中の重い処理を止める
//
// ・この Bot の /transfer・/export-log … 中止を要求する。
//   処理中のメッセージ1件が終わったところで止まり、実行者に結果が届く
// ・古いロック（実行されていない）     … ロックを解除する
// ・サーバーの更新（update.sh）        … Bot からは止められない（force で解除だけ可能）
// ・force: True                        … 状態に関係なくロックを解除する（最終手段）
// ========================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName('busy-stop')
        .setDescription('実行中の重い処理（/transfer など）を中止します')
        .addBooleanOption(option =>
            option
                .setName('force')
                .setDescription('止まらないときに、ロックを強制的に解除します（最終手段）')
                .setRequired(false)
        )
        // 初期状態ではサーバー管理権限を持つ人だけ。
        // サーバー設定 > 連携サービス から、使えるロールを変更できる
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {

        const force = interaction.options.getBoolean('force') ?? false;
        const by = interaction.member?.displayName ?? interaction.user.username;

        const status = getStatus();

        const reply = content =>
            interaction.reply({ content, flags: MessageFlags.Ephemeral });

        if (!status) {
            await reply('実行中の重い処理はありません。');
            return;
        }

        const before = describeStatus(status);

        console.log(`[busy-stop] ${by} が実行しました（force: ${force}）`, status.lock);

        if (force) {

            forceUnlock(by);

            const notes = [];

            if (status.mine) {
                notes.push('実行中の処理にも中止を要求しました。');
            }

            if (status.lock?.owner === 'update' && !status.stale) {
                notes.push('※ サーバーの更新そのものは止まっていません。');
            }

            await reply(['ロックを強制的に解除しました。', ...notes, '', before].join('\n'));
            return;
        }

        if (status.stale) {
            forceUnlock(by);
            await reply(`古いロックを解除しました。\n\n${before}`);
            return;
        }

        if (status.mine) {

            requestStop(by);

            await reply(
                `「${status.lock.task}」に中止を要求しました。\n` +
                '処理中のメッセージが終わり次第止まり、実行者に結果が通知されます。\n' +
                '数分たっても止まらない場合は、force: True を付けて再実行してください。\n\n' +
                before
            );
            return;
        }

        if (status.lock?.owner === 'update') {
            await reply(
                'サーバーの更新（deploy/update.sh）中のため、Bot からは止められません。\n' +
                '終わるまで待つか、サーバー側で止めてください。\n' +
                'どうしてもロックだけ解除したい場合は、force: True を付けて再実行してください。\n\n' +
                before
            );
            return;
        }

        await reply(
            '中止できる処理が見つかりませんでした。\n' +
            'ロックを解除する場合は、force: True を付けて再実行してください。\n\n' +
            before
        );
    },
};
