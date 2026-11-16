import { describe, expect, it } from 'vitest';

import { findDurations, formatClock, parseNumber } from '../src/lib/durations';

const d = (text: string) => findDurations(text).map((x) => [x.label, x.seconds]);

describe('findDurations', () => {
  it.each([
    ['Bake for 25 minutes until golden.', [['25 min', 1500]]],
    ['Simmer 25-30 minutes.', [['25–30 min', 1500]]],
    ['Roast 25 to 30 mins, then rest.', [['25–30 min', 1500]]],
    ['Braise for 1 1/2 hours.', [['1½ hr', 5400]]],
    ['Braise for 1½ hours.', [['1½ hr', 5400]]],
    ['Bake 1 hour and 15 minutes.', [['1 hr 15 min', 4500]]],
    ['Cook 1 hr 15 min, covered.', [['1 hr 15 min', 4500]]],
    ['Microwave 45 seconds.', [['45 sec', 45]]],
    ['Boil 10-minute eggs.', [['10 min', 600]]],
    ['Sear 3 minutes per side, then rest 10 minutes.', [['3 min', 180], ['10 min', 600]]],
    ['Chill at least 2 hrs.', [['2 hr', 7200]]],
  ])('%s', (text, expected) => {
    expect(d(text)).toEqual(expected);
  });

  it('ignores temperatures, quantities and steps without times', () => {
    expect(d('Preheat oven to 350 degrees.')).toEqual([]);
    expect(d('Add 2 cups flour and mix.')).toEqual([]);
    expect(d('Season to taste.')).toEqual([]);
  });

  it('dedupes repeated times', () => {
    expect(d('Stir every 10 minutes for 10 minutes.')).toEqual([['10 min', 600]]);
  });
});

describe('helpers', () => {
  it('parses numbers', () => {
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('3/4')).toBe(0.75);
    expect(parseNumber('2½')).toBe(2.5);
    expect(parseNumber('¼')).toBe(0.25);
  });
  it('formats clocks', () => {
    expect(formatClock(3909)).toBe('1:05:09');
    expect(formatClock(723)).toBe('12:03');
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(44.2)).toBe('0:45');
  });
});
