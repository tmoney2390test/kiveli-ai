import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../apps/together/dist-web/", import.meta.url));
if (!existsSync(root)) {
  console.error("Build apps/together/dist-web before checking the web budget.");
  process.exit(1);
}

const files = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const entry = files.find((file) => /[\\/]_expo[\\/]static[\\/]js[\\/]web[\\/]entry-.*\.js$/.test(file));
if (!entry) {
  console.error("The exported web entry bundle was not found.");
  process.exit(1);
}

const raw = readFileSync(entry);
const gzipBytes = gzipSync(raw, { level: 9 }).byteLength;
const largestAsset = files
  .filter((file) => file.includes(`${join("", "assets")}`))
  .map((file) => ({ file, bytes: statSync(file).size }))
  .sort((left, right) => right.bytes - left.bytes)[0];
const entryBudget = 1.35 * 1024 * 1024;
const assetBudget = 2.25 * 1024 * 1024;

console.log(`Web entry: ${(raw.byteLength / 1024 / 1024).toFixed(2)} MiB raw / ${(gzipBytes / 1024 / 1024).toFixed(2)} MiB gzip`);
if (largestAsset) console.log(`Largest asset: ${(largestAsset.bytes / 1024 / 1024).toFixed(2)} MiB · ${relative(root, largestAsset.file)}`);
if (gzipBytes > entryBudget) {
  console.error(`Compressed entry exceeds the ${(entryBudget / 1024 / 1024).toFixed(2)} MiB budget.`);
  process.exitCode = 1;
}
if (largestAsset && largestAsset.bytes > assetBudget) {
  console.error(`Largest static asset exceeds the ${(assetBudget / 1024 / 1024).toFixed(2)} MiB budget.`);
  process.exitCode = 1;
}
