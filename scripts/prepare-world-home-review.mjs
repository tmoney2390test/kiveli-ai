import {spawnSync} from 'node:child_process';
import {worldHomeCounts} from './world-home-catalog.mjs';
const [world]=process.argv.slice(2);if(!(world in worldHomeCounts))throw Error('Unknown world');
for(const args of [['scripts/release-world-homes.mjs','review',world],['scripts/review-home-artwork-sheets.mjs','.test-tmp/world-home-artwork/'+world],['scripts/home-review-overview.mjs',world]]){
 const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status??1);
}
