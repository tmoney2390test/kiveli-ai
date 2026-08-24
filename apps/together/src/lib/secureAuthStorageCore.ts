export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SecureKeyValueStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type ChunkManifest = { version: 1; generation: string; count: number };
const CHUNK_CODE_UNITS = 400;
const MAX_CHUNKS = 128;

export function createChunkedSecureStorage(secure: SecureKeyValueStorage, legacy: AsyncKeyValueStorage): AsyncKeyValueStorage {
  return {
    async getItem(key) {
      const secureKey = normalizeSecureKey(key);
      const current = await readChunked(secure, secureKey);
      if (current !== null) return current;
      const unchunked = await secure.getItemAsync(secureKey);
      if (unchunked !== null) {
        await writeChunked(secure, secureKey, unchunked);
        await secure.deleteItemAsync(secureKey);
        return unchunked;
      }
      const previous = await legacy.getItem(key);
      if (previous === null) return null;
      await writeChunked(secure, secureKey, previous);
      await legacy.removeItem(key);
      return previous;
    },
    async setItem(key, value) {
      await writeChunked(secure, normalizeSecureKey(key), value);
      await legacy.removeItem(key);
    },
    async removeItem(key) {
      const secureKey = normalizeSecureKey(key);
      const manifest = await readManifest(secure, secureKey);
      if (manifest) await Promise.all(Array.from({ length: manifest.count }, (_, index) => secure.deleteItemAsync(chunkKey(secureKey, manifest.generation, index))));
      await Promise.all([secure.deleteItemAsync(manifestKey(secureKey)), secure.deleteItemAsync(secureKey), legacy.removeItem(key)]);
    },
  };
}

async function readChunked(secure: SecureKeyValueStorage, key: string) {
  const manifest = await readManifest(secure, key);
  if (!manifest) return null;
  const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) => secure.getItemAsync(chunkKey(key, manifest.generation, index))));
  if (chunks.some((chunk) => chunk === null)) return null;
  return chunks.join('');
}

async function writeChunked(secure: SecureKeyValueStorage, key: string, value: string) {
  const previous = await readManifest(secure, key);
  const generation = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const chunks = splitSafely(value);
  if (chunks.length > MAX_CHUNKS) throw new Error('The secure authentication session is unexpectedly large.');
  await Promise.all(chunks.map((chunk, index) => secure.setItemAsync(chunkKey(key, generation, index), chunk)));
  const manifest: ChunkManifest = { version: 1, generation, count: chunks.length };
  await secure.setItemAsync(manifestKey(key), JSON.stringify(manifest));
  if (previous && previous.generation !== generation) await Promise.all(Array.from({ length: previous.count }, (_, index) => secure.deleteItemAsync(chunkKey(key, previous.generation, index))));
}

async function readManifest(secure: SecureKeyValueStorage, key: string): Promise<ChunkManifest | null> {
  const value = await secure.getItemAsync(manifestKey(key));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ChunkManifest>;
    if (parsed.version !== 1 || typeof parsed.generation !== 'string' || !/^[a-z0-9]+$/i.test(parsed.generation) || !Number.isInteger(parsed.count) || Number(parsed.count) < 1 || Number(parsed.count) > MAX_CHUNKS) return null;
    return { version: 1, generation: parsed.generation, count: Number(parsed.count) };
  } catch {
    return null;
  }
}

function splitSafely(value: string) {
  if (!value) return [''];
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + CHUNK_CODE_UNITS);
    const finalCodeUnit = value.charCodeAt(end - 1);
    if (end < value.length && finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

function normalizeSecureKey(key: string) {
  return `kivelle.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

const manifestKey = (key: string) => `${key}.manifest`;
const chunkKey = (key: string, generation: string, index: number) => `${key}.${generation}.${index}`;
