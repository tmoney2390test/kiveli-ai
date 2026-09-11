import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const registryPath = fileURLToPath(new URL('./assets.ts', import.meta.url));
const portraitsRoot = fileURLToPath(new URL('../assets/characters', import.meta.url));

function registeredCharacterKeys(source) {
  return new Set(
    [...source.matchAll(/(?:'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(?:require|catalogArtwork)\(/g)]
      .map((match) => match[1] ?? match[2])
      .filter(Boolean),
  );
}

function primaryPortraitSlugs() {
  return readdirSync(portraitsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((world) =>
      readdirSync(join(portraitsRoot, world.name), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp)$/i.test(entry.name))
        .map((entry) => basename(entry.name, extname(entry.name)))
        .filter((slug) => !slug.includes('--secondary-')),
    );
}

describe('registered character portraits', () => {
  it('registers every primary character portrait file', () => {
    const keys = registeredCharacterKeys(readFileSync(registryPath, 'utf8'));
    const missing = [...new Set(primaryPortraitSlugs())]
      .filter((slug) => !keys.has(slug))
      .sort();

    expect(missing).toEqual([]);
  });
});
