import { randomBytes } from "node:crypto";

export function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const pick = (chars: string) => chars[randomBytes(1).readUInt8(0) % chars.length];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  const pool = upper + lower + digits + special;
  for (let i = 0; i < 8; i++) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomBytes(1).readUInt8(0) % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}