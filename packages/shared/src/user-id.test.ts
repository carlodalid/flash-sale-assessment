import { describe, expect, it } from 'vitest';
import { normalizeUserId } from './user-id';

describe('normalizeUserId', () => {
  it('trims and lowercases so the same person maps to one identifier', () => {
    expect(normalizeUserId('  Alice@Example.COM ')).toEqual({
      valid: true,
      userId: 'alice@example.com',
    });
  });

  it.each(['bob', 'carl.dalid', 'user_42', 'first+tag@mail.io', 'a-b'])(
    'accepts %s',
    (input) => {
      expect(normalizeUserId(input).valid).toBe(true);
    },
  );

  it.each([
    ['too short', 'ab'],
    ['too short after trimming', '  ab  '],
    ['too long', 'x'.repeat(65)],
    ['contains a space', 'alice smith'],
    ['contains a slash', 'alice/bob'],
    ['contains a non-ASCII letter', 'jösé'],
    ['empty', ''],
  ])('rejects an identifier that is %s', (_, input) => {
    expect(normalizeUserId(input).valid).toBe(false);
  });

  it('accepts exactly the length limits', () => {
    expect(normalizeUserId('abc').valid).toBe(true);
    expect(normalizeUserId('x'.repeat(64)).valid).toBe(true);
  });

  it.each([undefined, null, 42, { userId: 'alice' }])('rejects non-string input %j', (input) => {
    expect(normalizeUserId(input)).toEqual({
      valid: false,
      reason: 'Identifier must be a string.',
    });
  });
});
