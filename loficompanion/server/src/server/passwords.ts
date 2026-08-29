import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordPolicy } from '@/domain/config';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(encoded: string, password: string) {
  const [algorithm, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePasswordAgainstPolicy(
  policy: PasswordPolicy,
  password: string,
): string[] {
  const reasons: string[] = [];
  if (password.length < policy.minLength) reasons.push('PASSWORD_TOO_SHORT');
  if (password.length > policy.maxLength) reasons.push('PASSWORD_TOO_LONG');
  if (policy.requireUppercase && !/[A-Z]/.test(password)) reasons.push('PASSWORD_MISSING_UPPERCASE');
  if (policy.requireLowercase && !/[a-z]/.test(password)) reasons.push('PASSWORD_MISSING_LOWERCASE');
  if (policy.requireDigit && !/\d/.test(password)) reasons.push('PASSWORD_MISSING_DIGIT');
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) reasons.push('PASSWORD_MISSING_SYMBOL');
  return reasons;
}

