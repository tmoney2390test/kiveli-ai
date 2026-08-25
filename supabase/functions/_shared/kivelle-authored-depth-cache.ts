type CacheEntry<T> = { value: T; expiresAt: number };

/** A small process-local cache for server-authored, non-user-specific rows. */
export class BoundedTtlCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maximumEntries: number,
  ) {}

  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    now = Date.now(),
  ): Promise<T> {
    const existing = this.values.get(key);
    if (existing && existing.expiresAt > now) {
      this.values.delete(key);
      this.values.set(key, existing);
      return existing.value;
    }
    if (existing) this.values.delete(key);
    const inFlight = this.pending.get(key);
    if (inFlight) return await inFlight;
    const request = loader().then((value) => {
      this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      this.trim();
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return await request;
  }

  clear(): void {
    this.values.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.values.size;
  }

  private trim(): void {
    while (this.values.size > this.maximumEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

export function authoredDepthCacheKey(input: {
  worldId: string;
  locationId: string | null;
  districtId: string | null;
  terms: string[];
  categories: string[];
  beatTerms: string[];
  interactionModes: string[];
}): string {
  return JSON.stringify([
    input.worldId,
    input.locationId,
    input.districtId,
    [...input.terms].sort(),
    [...input.categories].sort(),
    [...input.beatTerms].sort(),
    [...input.interactionModes].sort(),
  ]);
}
