import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'apps/together/assets/startup');
const source = resolve(assets, 'loading-kivelli.gif');
const animation = await sharp(source, { animated: true }).metadata();
if (animation.width !== 512 || animation.pageHeight !== 512 || !animation.pages) {
  throw new Error('Expected the supplied 512 px animated startup logo.');
}

const { data, info } = await sharp(source, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const background = [1, 0, 21];
for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
  const offset = pixel * 4;
  const brightness = Math.max(data[offset], data[offset + 1], data[offset + 2]);
  const opacity = Math.max(0, Math.min(1, (brightness - 30) * 3 / 255)) * (data[offset + 3] / 255);
  for (let channel = 0; channel < 3; channel += 1) {
    data[offset + channel] = opacity
      ? Math.max(0, Math.min(255, Math.round((data[offset + channel] - (1 - opacity) * background[channel]) / opacity)))
      : 0;
  }
  data[offset + 3] = Math.round(opacity * 255);
}

const outputSize = 384;
const resizedFrames = [];
const frameDelays = [];
const bytesPerFrame = info.width * animation.pageHeight * 4;
// The slow pulse remains three seconds long; dropping every third frame keeps
// its bundled asset within the native asset budget without flattening it.
for (let frame = 0; frame < animation.pages; frame += 1) {
  if (frame % 3 === 2) {
    frameDelays[frameDelays.length - 1] += animation.delay[frame];
    continue;
  }
  resizedFrames.push(await sharp(data.subarray(frame * bytesPerFrame, (frame + 1) * bytesPerFrame), {
    raw: { width: info.width, height: animation.pageHeight, channels: 4 },
  }).resize(outputSize, outputSize).raw().toBuffer());
  frameDelays.push(animation.delay[frame]);
}
const frames = sharp(Buffer.concat(resizedFrames), {
  raw: { width: outputSize, height: outputSize * resizedFrames.length, channels: 4, pageHeight: outputSize },
});
await frames.webp({ quality: 80, effort: 3, loop: 0, delay: frameDelays })
  .toFile(resolve(assets, 'loading-kivelli.webp'));
await sharp(data.subarray(0, info.width * animation.pageHeight * 4), {
  raw: { width: info.width, height: animation.pageHeight, channels: 4 },
}).png({ compressionLevel: 9 }).toFile(resolve(assets, 'loading-kivelli-still.png'));
