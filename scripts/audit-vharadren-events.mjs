import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditVharadrenEvents } from './lib/vharadren-event-language.mjs';

const sourcePath = resolve(process.argv[2] ?? 'C:/Users/Tim19/Downloads/vharadren_content_pack.json');
const pack = JSON.parse(await readFile(sourcePath, 'utf8'));
const result = auditVharadrenEvents(pack);
const audit = {
  ok: result.ok,
  failures: result.failures,
  scheduleRows: result.scheduleRows,
  scheduleVariants: result.scheduleVariants,
  distinctVariants: result.distinctVariants,
  recurringEvents: result.recurringEvents,
};
console.log(JSON.stringify({ sourcePath, ...audit }, null, 2));
if (!audit.ok) process.exitCode = 1;
