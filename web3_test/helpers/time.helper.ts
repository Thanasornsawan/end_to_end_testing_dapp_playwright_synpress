// helpers/time.helper.ts
export class TimeHelper {
    private static readonly TIME_UNITS = {
        seconds: 1,
        minutes: 60,
        hours: 3600,
        days: 86400
    };

    static convertToSeconds(value: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): number {
        return value * this.TIME_UNITS[unit];
    }

    static getTimeDescription(seconds: number): string {
        if (seconds >= this.TIME_UNITS.days) {
            return `${seconds / this.TIME_UNITS.days} days`;
        } else if (seconds >= this.TIME_UNITS.hours) {
            return `${seconds / this.TIME_UNITS.hours} hours`;
        } else if (seconds >= this.TIME_UNITS.minutes) {
            return `${seconds / this.TIME_UNITS.minutes} minutes`;
        }
        return `${seconds} seconds`;
    }
}