import { createHmac } from "crypto";

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function createBackendAuthToken(subject: string, email?: string | null) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return undefined;
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ sub: subject, email: email || undefined, aud: "ralphguard-backend", iat: now, exp: now + 3600 }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
