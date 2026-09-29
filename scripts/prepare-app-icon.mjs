import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'apps/together/assets');
const source = resolve(assets, 'icon-source.png');
const play = resolve(root, 'release/google-play/app-icon.png');

const metadata = await sharp(source).metadata();
if (metadata.width !== metadata.height || (metadata.width ?? 0) < 1024) {
  throw new Error('The app icon source must be square and at least 1024 pixels.');
}

const primary = await sharp(source).resize(1024, 1024, { kernel: 'lanczos3' })
  .toColourspace('srgb').removeAlpha().png({ compressionLevel: 9 }).toBuffer();
await sharp(primary).toFile(resolve(assets, 'icon.png'));

// The colored and monochrome cutouts let iOS use the same mark over dark,
// clear, and tinted system surfaces. Keep the standard/App Store icon opaque.
const { data, info } = await sharp(primary).raw().toBuffer({ resolveWithObject: true });
const colored = Buffer.alloc(info.width * info.height * 4);
const monochrome = Buffer.alloc(colored.length);
for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
  const input = pixel * info.channels;
  const output = pixel * 4;
  const red = data[input] ?? 0;
  const green = data[input + 1] ?? 0;
  const blue = data[input + 2] ?? 0;
  const alpha = Math.round(Math.max(0, Math.min(255, (Math.max(red, green, blue) - 30) * 2.35)));
  const boost = alpha > 0 ? Math.min(2.2, 255 / Math.max(alpha, 105)) : 1;
  colored[output] = Math.min(255, Math.round(red * boost));
  colored[output + 1] = Math.min(255, Math.round(green * boost));
  colored[output + 2] = Math.min(255, Math.round(blue * boost));
  colored[output + 3] = alpha;
  monochrome[output] = 255;
  monochrome[output + 1] = 255;
  monochrome[output + 2] = 255;
  // A tighter mask keeps the tinted/clear appearance recognizable after the
  // system applies its own tint and glass effects.
  monochrome[output + 3] = Math.round(Math.max(0, Math.min(255, (Math.max(red, green, blue) - 92) * 2.8)));
}
const rawOptions = { raw: { width: info.width, height: info.height, channels: 4 } };
const dark = await sharp(colored, rawOptions).png({ compressionLevel: 9 }).toBuffer();
const tinted = await sharp(monochrome, rawOptions).png({ compressionLevel: 9 }).toBuffer();
await sharp(dark).toFile(resolve(assets, 'icon-dark.png'));
await sharp(tinted).toFile(resolve(assets, 'icon-tinted.png'));

// Android masks adaptive icons more aggressively than iOS. Center the mark
// within its safe area, with the same mark available to themed launchers.
const transparent = { create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } };
for (const [image, filename] of [[dark, 'icon-android-adaptive.png'], [tinted, 'icon-android-monochrome.png']]) {
  const foreground = await sharp(image).resize(760, 760).toBuffer();
  await sharp(transparent).composite([{ input: foreground, left: 132, top: 132 }])
    .png({ compressionLevel: 9 }).toFile(resolve(assets, filename));
}

await mkdir(resolve(root, 'release/google-play'), { recursive: true });
await sharp(primary).resize(512, 512).ensureAlpha().png({ compressionLevel: 9 }).toFile(play);
await sharp(primary).resize(512, 512).webp({ quality: 90, effort: 4 })
  .toFile(resolve(assets, 'startup/app-icon.webp'));
