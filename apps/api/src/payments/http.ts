export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

export class TokenCache {
  private cached: { value: string; expiresAt: number } | null = null;

  async get(load: () => Promise<{ token: string; expiresInSeconds: number }>): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now + 30_000) return this.cached.value;
    const fresh = await load();
    const ttlMs = Math.max(60, fresh.expiresInSeconds) * 1000;
    this.cached = { value: fresh.token, expiresAt: now + ttlMs };
    return fresh.token;
  }
}

type FetchArgs = Parameters<typeof fetch>;

export async function httpRequest(
  fetchImpl: typeof fetch,
  url: string,
  init: NonNullable<FetchArgs[1]>,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await readJson(response) };
}
