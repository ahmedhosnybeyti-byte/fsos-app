import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Phase 6 — Data Sources Management: "connection credentials must be stored
// securely and never shown to the user." AES-256-GCM, reversible (unlike
// argon2's one-way hashing used for user/API-key passwords elsewhere) —
// deliberately reversible because a future phase (Refresh Center) needs the
// real value to actually open a connection; only the API response layer
// guarantees it's never echoed back (see DataSourcesService's public
// mapping, which only ever exposes `hasCredentials: boolean`).
//
// The AES key is derived (SHA-256) from the existing JWT access secret plus
// a fixed, purpose-specific context string — a standard subkey-derivation
// technique that avoids requiring a brand-new environment variable/secret
// for this one feature while still keeping the derived key distinct from
// the JWT signing key itself.
function deriveKey(jwtAccessSecret: string): Buffer {
  return createHash("sha256").update(`fsos:data-source-credentials:${jwtAccessSecret}`).digest();
}

export function encryptCredentials(jwtAccessSecret: string, plain: Record<string, string>): string {
  const key = deriveKey(jwtAccessSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptCredentials(jwtAccessSecret: string, cipherText: string): Record<string, string> {
  const [ivB64, authTagB64, dataB64] = cipherText.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Malformed credential ciphertext");
  }
  const key = deriveKey(jwtAccessSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
