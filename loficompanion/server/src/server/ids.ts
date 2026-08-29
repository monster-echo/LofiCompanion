import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function createId() {
  return randomUUID();
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

