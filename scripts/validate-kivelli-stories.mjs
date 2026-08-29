import { validateStoryDefinitionReport } from '../packages/together-domain/src/stories.ts';
import { LAST_NIGHT_IN_VESPORMOOR } from '../supabase/functions/_shared/kivelle-stories-content.ts';

const packs = [LAST_NIGHT_IN_VESPORMOOR];
let failed = false;
for (const pack of packs) {
  const report = validateStoryDefinitionReport(pack);
  console.log(`${pack.slug}@${pack.version ?? 1}: ${report.errors.length} errors, ${report.warnings.length} warnings`);
  for (const warning of report.warnings) console.warn(`  warning: ${warning}`);
  for (const error of report.errors) {
    failed = true;
    console.error(`  error: ${error}`);
  }
}
if (failed) process.exitCode = 1;
