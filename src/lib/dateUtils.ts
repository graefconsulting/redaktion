import {
    getISOWeek,
    getISOWeekYear,
    addWeeks,
    startOfISOWeek,
    endOfISOWeek,
    format
} from "date-fns";
import { de } from "date-fns/locale";

/**
 * Gets the current ISO year and week.
 */
export function getCurrentIsoWeek() {
    const now = new Date();
    return {
        year: getISOWeekYear(now),
        week: getISOWeek(now)
    };
}

/**
 * Gets the *next* full ISO week (which is the default for new planning).
 */
export function getNextFullIsoWeek() {
    const nextWeek = addWeeks(new Date(), 1);
    return {
        year: getISOWeekYear(nextWeek),
        week: getISOWeek(nextWeek)
    };
}

/**
 * Checks if a given year/week combination is strictly in the past
 * (meaning the entire week has already concluded, or it's a previous year).
 * For MVP: We prevent planning for weeks that have already started or passed.
 */
export function isWeekInPast(year: number, week: number): boolean {
    const current = getCurrentIsoWeek();
    if (year < current.year) return true;
    if (year === current.year && week < current.week) return true;
    return false;
}

/**
 * Returns a formatted string representing the date range of a given ISO week.
 * Example: "Mo, 24.10. - So, 30.10."
 */
export function getWeekDateRange(year: number, week: number): string {
    // To get the start of a specific ISO week, we construct a date in that year
    // and manually adjust, or we can use a small hack with date-fns:
    // We start at Jan 4th of the year (always week 1), then add (week - 1) weeks.
    const jan4 = new Date(year, 0, 4);
    const targetWeekDate = addWeeks(jan4, week - 1);

    const start = startOfISOWeek(targetWeekDate);
    const end = endOfISOWeek(targetWeekDate);

    const formatStr = "EE, dd.MM.";
    return `${format(start, formatStr, { locale: de })} - ${format(end, formatStr, { locale: de })}`;
}

/**
 * Given a year, an ISO week, and a German weekday string (e.g., "Montag"),
 * returns a formatted full date string (e.g., "Montag, 12.03.2026").
 */
export function getDateForWeekday(year: number, week: number, weekdayName: string): string {
    const jan4 = new Date(year, 0, 4);
    const targetWeekDate = addWeeks(jan4, week - 1);
    const start = startOfISOWeek(targetWeekDate);

    // German weekdays mapping to offset from Monday (0-indexed)
    const dayMap: Record<string, number> = {
        "Montag": 0,
        "Dienstag": 1,
        "Mittwoch": 2,
        "Donnerstag": 3,
        "Freitag": 4,
        "Samstag": 5,
        "Sonntag": 6
    };

    const offset = dayMap[weekdayName];
    if (offset !== undefined) {
        const targetDate = new Date(start);
        targetDate.setDate(targetDate.getDate() + offset);
        return format(targetDate, "EEEE, dd.MM.yyyy", { locale: de });
    }

    return weekdayName; // Fallback if unrecognized
}

/**
 * Generates an array of the next 10 upcoming weeks for the dropdown selector.
 */
export function getUpcomingWeeksOptions(count: number = 10) {
    const options = [];

    // Start from current week or next week? Master prompt: "Default: next full calendar week".
    // We'll provide options starting from current week so they CAN plan current week if they really want to,
    // but we default the UI selection to next week.

    const baseDate = new Date();

    for (let i = 0; i < count; i++) {
        const targetDate = addWeeks(baseDate, i);
        const y = getISOWeekYear(targetDate);
        const w = getISOWeek(targetDate);
        options.push({
            year: y,
            week: w,
            label: `KW ${w} (${y})`,
            dateRange: getWeekDateRange(y, w)
        });
    }

    return options;
}
