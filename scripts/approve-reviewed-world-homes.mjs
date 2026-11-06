// Requires the actual sheet numbers inspected; never generates assets or enables visits.
import {spawnSync} from 'node:child_process';
import {worldHomeCounts} from './world-home-catalog.mjs';
const [world,sheets]=process.argv.slice(2);
if(!(world in worldHomeCounts)||!sheets)throw Error('Usage: <world> <comma-separated reviewed sheets>');
for(const args of [['scripts/record-world-home-review.mjs',world,sheets],['scripts/release-world-homes.mjs','approve',world,'content/homes/reviewed/'+world+'.json'],['scripts/verify-world-home-release.mjs',world]]){
 const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status??1);
}
