import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('비밀번호는 12~256자로 설정하세요.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export const validHash = hash => /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash ?? '');
export async function verifyPassword(password, hash) {
  if (!validHash(hash) || typeof password !== 'string' || password.length > 256) return false;
  const [, salt, digest] = hash.split(':');
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(digest, 'hex'));
}
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
