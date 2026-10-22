import { Redis } from "@upstash/redis";

// Minimal key-value interface used by the game. Backed by Upstash Redis when
// configured (required on Vercel, where every request may hit a different
// instance), otherwise by an in-memory map for local development.

export interface Store {
  readonly persistent: boolean;
  get<T>(key: string): Promise<T | null>;
  /** Returns false if `nx` was set and the key already existed. */
  set(key: string, value: unknown, opts: { ttl: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  /** Sets the field only if it doesn't exist yet. Returns true if it was set. */
  hsetnx(key: string, field: string, value: unknown): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
  hlen(key: string): Promise<number>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
}

function redisFromEnv(): Redis | null {
  // Vercel's Upstash marketplace integration sets KV_REST_API_*; a direct
  // Upstash setup uses UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, enableAutoPipelining: true });
}

class RedisStore implements Store {
  readonly persistent = true;
  constructor(private r: Redis) {}
  get<T>(key: string) {
    return this.r.get<T>(key);
  }
  async set(key: string, value: unknown, { ttl, nx }: { ttl: number; nx?: boolean }) {
    const res = nx ? await this.r.set(key, value, { ex: ttl, nx: true }) : await this.r.set(key, value, { ex: ttl });
    return res === "OK";
  }
  async del(key: string) {
    await this.r.del(key);
  }
  hget<T>(key: string, field: string) {
    return this.r.hget<T>(key, field);
  }
  async hgetall<T>(key: string) {
    return ((await this.r.hgetall<Record<string, T>>(key)) ?? {}) as Record<string, T>;
  }
  async hset(key: string, field: string, value: unknown) {
    await this.r.hset(key, { [field]: value });
  }
  async hsetnx(key: string, field: string, value: unknown) {
    return (await this.r.hsetnx(key, field, value)) === 1;
  }
  async hdel(key: string, field: string) {
    await this.r.hdel(key, field);
  }
  hlen(key: string) {
    return this.r.hlen(key);
  }
  hincrby(key: string, field: string, by: number) {
    return this.r.hincrby(key, field, by);
  }
  async expire(key: string, ttl: number) {
    await this.r.expire(key, ttl);
  }
}

type Entry = { value: unknown; expires: number };

class MemoryStore implements Store {
  readonly persistent = false;
  private data = new Map<string, Entry>();

  private entry(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.expires < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  private hash(key: string, create = false): Record<string, unknown> | undefined {
    const e = this.entry(key);
    if (e) return e.value as Record<string, unknown>;
    if (!create) return undefined;
    const h: Record<string, unknown> = {};
    this.data.set(key, { value: h, expires: Date.now() + 86_400_000 });
    return h;
  }
  // Values are cloned so callers can't mutate stored state by accident,
  // mirroring the serialization a real Redis does.
  private clone<T>(v: unknown): T {
    return v === undefined ? (null as T) : (JSON.parse(JSON.stringify(v)) as T);
  }

  async get<T>(key: string) {
    return this.clone<T>(this.entry(key)?.value);
  }
  async set(key: string, value: unknown, { ttl, nx }: { ttl: number; nx?: boolean }) {
    if (nx && this.entry(key)) return false;
    this.data.set(key, { value: this.clone(value), expires: Date.now() + ttl * 1000 });
    return true;
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async hget<T>(key: string, field: string) {
    return this.clone<T>(this.hash(key)?.[field]);
  }
  async hgetall<T>(key: string) {
    return this.clone<Record<string, T>>(this.hash(key) ?? {});
  }
  async hset(key: string, field: string, value: unknown) {
    this.hash(key, true)![field] = this.clone(value);
  }
  async hsetnx(key: string, field: string, value: unknown) {
    const h = this.hash(key, true)!;
    if (field in h) return false;
    h[field] = this.clone(value);
    return true;
  }
  async hdel(key: string, field: string) {
    const h = this.hash(key);
    if (h) delete h[field];
  }
  async hlen(key: string) {
    return Object.keys(this.hash(key) ?? {}).length;
  }
  async hincrby(key: string, field: string, by: number) {
    const h = this.hash(key, true)!;
    const next = (Number(h[field]) || 0) + by;
    h[field] = next;
    return next;
  }
  async expire(key: string, ttl: number) {
    const e = this.entry(key);
    if (e) e.expires = Date.now() + ttl * 1000;
  }
}

// Keep a single instance across hot reloads in dev.
const g = globalThis as unknown as { __quizStore?: Store };

export function getStore(): Store {
  if (!g.__quizStore) {
    const redis = redisFromEnv();
    g.__quizStore = redis ? new RedisStore(redis) : new MemoryStore();
  }
  return g.__quizStore;
}
