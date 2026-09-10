/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

describe('direct and group gallery video integration', () => {
  for (const path of ['../../app/chat.tsx', '../components/ConversationMediaGalleryModal.tsx']) {
    it(`wires authorized video frames into ${path}, not just source-photo posters`, () => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source).toMatch(/chatMediaVideoPreview\(item,\s*generatedById\)/);
      expect(source).toMatch(/visible\s*&&\s*videoPreview\.uri\s*\?\s*<VideoMomentThumbnail/);
      expect(source).toContain('uri={videoPreview.uri}');
      expect(source).toContain('contentFit="contain"');
    });
  }
});
