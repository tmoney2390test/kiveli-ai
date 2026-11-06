import { writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { loadWorldHomes, homeSeedSql } from './world-home-catalog.mjs';
const [world, file] = process.argv.slice(2);
if (!world || !file || !/^supabase[\\/]migrations[\\/]\d{14}_[\w-]+\.sql$/.test(relative(process.cwd(), resolve(file)))) throw Error('Use <world> <CLI-created migration file>');
const homes = await loadWorldHomes(world);
await writeFile(file, homeSeedSql(world, homes));
console.log(`Prepared ${homes.length} ${world} homes; visits stay disabled until image approval.`);
