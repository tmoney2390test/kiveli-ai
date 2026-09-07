import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const store = fileURLToPath(new URL('../node_modules/.pnpm/', import.meta.url));
const imagePackages = [...new Set(readdirSync(store).filter(name => name.startsWith('metro@')).map(name => createRequire(path.join(store, name, 'node_modules/metro/package.json')).resolve('image-size')))];

test('installed image parsers reject malformed ICNS, JXL and HEIF without hanging', () => {
  assert.ok(imagePackages.length, 'image-size must be installed to validate its security patch');
  for (const name of imagePackages) {
    const modulePath = name;
    // A bounded child prevents a patch regression from hanging the test runner.
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const { imageSize } = require(process.argv[1]);
      for (const size of [0, 1, 7]) {
        const icns = Buffer.alloc(24); icns.write('icns'); icns.writeUInt32BE(24, 4); icns.write('ic07', 8); icns.writeUInt32BE(size, 12);
        assert.throws(() => imageSize(icns));
        const heif = Buffer.alloc(32); heif.writeUInt32BE(16); heif.write('ftyp', 4); heif.write('heic', 8); heif.writeUInt32BE(size, 16); heif.write('free', 20);
        assert.throws(() => imageSize(heif));
        const jxl = Buffer.alloc(40); jxl.writeUInt32BE(12); jxl.write('JXL ', 4); jxl.writeUInt32BE(16, 12); jxl.write('ftyp', 16); jxl.write('jxl ', 20); jxl.writeUInt32BE(size, 28); jxl.write('jxlp', 32);
        assert.throws(() => imageSize(jxl));
      }
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN0cAAAAASUVORK5CYII=', 'base64');
      assert.equal(imageSize(png).width, 1);
      assert.equal(imageSize(png).height, 1);
    `, modulePath], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    assert.equal(result.error, undefined, `${name}: ${result.error?.message}`);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});
