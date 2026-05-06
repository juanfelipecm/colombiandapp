import "server-only";

export type RedisScalar = string | number | boolean | null;
export type RedisCommand = RedisScalar[];

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export async function redisCommand<T = unknown>(command: RedisCommand): Promise<T | null> {
  const creds = credentials();
  if (!creds) return null;

  const path = command.map((part) => encodeURIComponent(String(part ?? ""))).join("/");
  const resp = await fetch(`${creds.url}/${path}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Upstash command failed: ${resp.status}`);

  const data = (await resp.json()) as UpstashResponse<T>;
  if (data.error) throw new Error(data.error);
  return data.result ?? null;
}

export async function redisPipeline<T = unknown[]>(commands: RedisCommand[]): Promise<T | null> {
  const creds = credentials();
  if (!creds) return null;

  const resp = await fetch(`${creds.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Upstash pipeline failed: ${resp.status}`);

  const data = (await resp.json()) as T;
  return data;
}

export function hashToObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < raw.length; i += 2) {
      out[String(raw[i])] = String(raw[i + 1] ?? "");
    }
    return out;
  }
  if (typeof raw === "object") {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) out[key] = String(value ?? "");
    return out;
  }
  return {};
}

export function pairsToScores(raw: unknown): Array<{ member: string; score: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ member: string; score: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push({ member: String(raw[i]), score: Number(raw[i + 1]) || 0 });
  }
  return out;
}
