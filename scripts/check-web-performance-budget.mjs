import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(repositoryRoot, process.argv[2] || "apps/together/dist");
if (!existsSync(root)) {
  console.error(`Build ${relative(repositoryRoot, root)} before checking the web budget.`);
  process.exit(1);
}

const files = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const indexPath = join(root, "index.html");
if (!existsSync(indexPath)) {
  console.error("The exported index.html was not found.");
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
const initialScripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((match) => join(root, decodeURIComponent(match[1].replace(/^\//, ""))))
  .filter((file) => existsSync(file));
if (initialScripts.length === 0) {
  console.error("No initial web scripts were found in index.html.");
  process.exit(1);
}

const initialBytes = initialScripts.reduce((total, file) => total + statSync(file).size, 0);
const initialGzipBytes = initialScripts.reduce(
  (total, file) => total + gzipSync(readFileSync(file), { level: 9 }).byteLength,
  0,
);
const largestAsset = files
  .filter((file) => file.includes(`${join("", "assets")}`))
  .map((file) => ({ file, bytes: statSync(file).size }))
  .sort((left, right) => right.bytes - left.bytes)[0];
const initialScriptBudget = 1.05 * 1024 * 1024;
const assetBudget = 2.25 * 1024 * 1024;

console.log(`Initial JavaScript: ${(initialBytes / 1024 / 1024).toFixed(2)} MiB raw / ${(initialGzipBytes / 1024 / 1024).toFixed(2)} MiB gzip across ${initialScripts.length} files`);
if (largestAsset) console.log(`Largest asset: ${(largestAsset.bytes / 1024 / 1024).toFixed(2)} MiB · ${relative(root, largestAsset.file)}`);
if (initialGzipBytes > initialScriptBudget) {
  console.error(`Initial compressed JavaScript exceeds the ${(initialScriptBudget / 1024 / 1024).toFixed(2)} MiB budget.`);
  process.exitCode = 1;
}
if (largestAsset && largestAsset.bytes > assetBudget) {
  console.error(`Largest static asset exceeds the ${(assetBudget / 1024 / 1024).toFixed(2)} MiB budget.`);
  process.exitCode = 1;
}
