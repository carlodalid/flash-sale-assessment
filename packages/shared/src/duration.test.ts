import { describe, expect, it } from 'vitest';
import { parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30_000],
    ['5m', 300_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    [' 10s ', 10_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', '10', 's', '1.5m', '-5s', '5 minutes', '5M'])('rejects %j', (input) => {
    expect(() => parseDuration(input)).toThrow(/Invalid duration/);
  });
});
