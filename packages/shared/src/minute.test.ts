import { describe, expect, it } from 'vitest';
import { floorToMinute } from './minute';

const floor = (iso: string) => floorToMinute(new Date(iso)).toISOString();

describe('floorToMinute', () => {
  it('leaves a whole minute unchanged', () => {
    expect(floor('2026-10-23T09:02:00.000Z')).toBe('2026-10-23T09:02:00.000Z');
  });

  it('drops seconds, so 09:02:10 opens at 09:02 as displayed', () => {
    expect(floor('2026-10-23T09:02:10.000Z')).toBe('2026-10-23T09:02:00.000Z');
  });

  it('rounds down even at the last millisecond of a minute', () => {
    expect(floor('2026-10-23T09:02:59.999Z')).toBe('2026-10-23T09:02:00.000Z');
  });

  it('stays within the same hour and day', () => {
    expect(floor('2026-10-23T09:59:30.000Z')).toBe('2026-10-23T09:59:00.000Z');
    expect(floor('2026-12-31T23:59:59.999Z')).toBe('2026-12-31T23:59:00.000Z');
  });
});
