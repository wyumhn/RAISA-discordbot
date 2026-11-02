// ========================================
// 日本時間（JST, UTC+9）の日時ユーティリティ
//
// Bot を動かす PC のタイムゾーンに関係なく、常に日本時間で扱う。
// ========================================

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const WEEKDAYS = '日月火水木金土';


// Date → 日本時間の年月日・時分
function toJstParts(date) {

    const d = new Date(date.getTime() + JST_OFFSET_MS);

    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        weekday: d.getUTCDay(),
    };
}


// 日本時間の年月日・時分 → Date
// 2/30 のような存在しない日時は null を返す
function fromJstParts(year, month, day, hour = 0, minute = 0) {

    if (hour > 23 || minute > 59) {
        return null;
    }

    const date = new Date(
        Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS
    );

    const parts = toJstParts(date);

    if (
        parts.year !== year ||
        parts.month !== month ||
        parts.day !== day
    ) {
        return null;
    }

    return date;
}


// Date → "YYYY/MM/DD HH:mm"（日本時間）
function formatJst(date) {

    const p = toJstParts(date);

    const pad = (n, width = 2) => n.toString().padStart(width, '0');

    return (
        `${pad(p.year, 4)}/${pad(p.month)}/${pad(p.day)} ` +
        `${pad(p.hour)}:${pad(p.minute)}`
    );
}


// Date → "YYYY/MM/DD HH:mm:ss"（日本時間）
function formatJstSeconds(date) {
    const second = toJstParts(date).second.toString().padStart(2, '0');
    return `${formatJst(date)}:${second}`;
}


// Date → "日" "月" … の曜日
function jstWeekday(date) {
    return WEEKDAYS[toJstParts(date).weekday];
}


// ========================================
// 日時の文字列を日本時間として Date に変換
//
// 受け付ける形式（日付の区切りは / : - のどれでも可）:
//   2026/10/05 09:00   そのまま
//   26/10/05 09:00     年が2桁 → 2000年代
//   10/05 09:00        年を省略 → 実行した年（日本時間）
//   2026/10/05         時刻を省略 → start は 00:00、end は 23:59
//   26/10/05, 10/05    年・時刻の省略は組み合わせ可
//
// kind: 'start' または 'end'（時刻を省略したときの扱い）
//
// end で時刻を省略した場合は、23:59 台のメッセージも含まれるよう
// 23:59:59.999 を返す（表示上は 23:59）。
// ========================================

const DATE_TIME_PATTERN =
    /^(?:(\d{4}|\d{2})[\/:\-])?(\d{1,2})[\/:\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/;

function parseJapaneseDateTime(value, kind = 'start') {

    const match = value.trim().match(DATE_TIME_PATTERN);

    if (!match) {
        throw new Error(
            `日時 "${value}" は YYYY/MM/DD HH:mm 形式で指定してください。` +
            '（YY/MM/DD・MM/DD や、時刻の省略も可）'
        );
    }

    const [, yearText, monthText, dayText, hourText, minuteText] = match;

    let year;

    if (yearText === undefined) {
        year = toJstParts(new Date()).year;
    } else if (yearText.length === 2) {
        year = 2000 + Number(yearText);
    } else {
        year = Number(yearText);
    }

    const month = Number(monthText);
    const day = Number(dayText);

    const hasTime = hourText !== undefined;

    let date;

    if (hasTime) {
        date = fromJstParts(year, month, day, Number(hourText), Number(minuteText));
    } else if (kind === 'end') {
        const endOfDay = fromJstParts(year, month, day, 23, 59);
        date = endOfDay && new Date(endOfDay.getTime() + 59 * 1000 + 999);
    } else {
        date = fromJstParts(year, month, day, 0, 0);
    }

    if (!date) {
        throw new Error(`日時 "${value}" が不正です。`);
    }

    return date;
}

module.exports = {
    toJstParts,
    fromJstParts,
    formatJst,
    formatJstSeconds,
    jstWeekday,
    parseJapaneseDateTime,
};
