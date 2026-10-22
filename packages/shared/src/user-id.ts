export const USER_ID_MIN_LENGTH = 3;
export const USER_ID_MAX_LENGTH = 64;

const ALLOWED_CHARACTERS = /^[a-z0-9._@+-]+$/;

export type UserIdValidation =
  | { valid: true; userId: string }
  | { valid: false; reason: string };

/**
 * Users identify themselves with a free-text identifier (a username or an email).
 * Normalising it means "Alice@Example.com " and "alice@example.com" are the same
 * buyer, which is what makes the one-purchase-per-user rule meaningful.
 */
export function normalizeUserId(raw: unknown): UserIdValidation {
  if (typeof raw !== 'string') {
    return { valid: false, reason: 'Identifier must be a string.' };
  }

  const userId = raw.trim().toLowerCase();

  if (userId.length < USER_ID_MIN_LENGTH || userId.length > USER_ID_MAX_LENGTH) {
    return {
      valid: false,
      reason: `Identifier must be ${USER_ID_MIN_LENGTH}-${USER_ID_MAX_LENGTH} characters.`,
    };
  }

  if (!ALLOWED_CHARACTERS.test(userId)) {
    return {
      valid: false,
      reason: 'Identifier may only contain letters, digits and . _ @ + -',
    };
  }

  return { valid: true, userId };
}
