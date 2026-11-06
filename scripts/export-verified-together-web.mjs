// Run in apps/together through EAS env:exec production. Use the app's installed
// Expo directly so release builds never invoke a package-manager install.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../apps/together',import.meta.url));
for(const [path,args] of [
 ['node_modules/expo/bin/cli',['export','--platform','web','--output-dir','dist','--clear']],
 ['../../scripts/verify-together-web-config.mjs',['dist']],
 ['../../scripts/check-web-performance-budget.mjs',['apps/together/dist']],
]){
 const p=spawnSync(process.execPath,[path,...args],{cwd:app,stdio:'inherit'});if(p.status!==0)process.exit(p.status??1);
}
