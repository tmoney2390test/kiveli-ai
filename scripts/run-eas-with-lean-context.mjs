import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const appDirectory = join(repositoryRoot, "apps", "together");
const easArguments = process.argv.slice(2);
const easCliVersion = process.env.KIVELLE_EAS_CLI_VERSION ?? "16.17.0";

if (easArguments.length === 0 || easArguments.includes("--help-context")) {
  console.log(
    "Usage: node scripts/run-eas-with-lean-context.mjs <eas command> [...arguments]",
  );
  process.exit(easArguments.length === 0 ? 1 : 0);
}

// EAS's VCS archive path currently copies the full .git object store on some
// Windows/monorepo combinations. No-VCS mode still honors the root
// .easignore, includes all workspace packages, and keeps build uploads lean.
const environment = {
  ...process.env,
  EAS_NO_VCS: "1",
  EAS_PROJECT_ROOT: repositoryRoot,
};

const pnpmCli = process.env.npm_execpath;
const executable = pnpmCli
  ? process.execPath
  : "pnpm";
const commandArguments = pnpmCli
  ? [pnpmCli, "dlx", `eas-cli@${easCliVersion}`, ...easArguments]
  : ["dlx", `eas-cli@${easCliVersion}`, ...easArguments];

if(easArguments[0]==='build'&&!easArguments.includes('--help')){
  const profileName=easArguments[easArguments.indexOf('--profile')+1];
  const config=JSON.parse(readFileSync(join(appDirectory,'eas.json'),'utf8'));
  const profile=config.build[profileName];
  if(!profile?.environment){console.error('Select a build profile with an explicit EAS environment.');process.exit(1);}
  if(!profile.developmentClient){
    const platform=easArguments[easArguments.indexOf('--platform')+1];
    if(!['ios','android','all'].includes(platform)){console.error('Select --platform ios, android, or all.');process.exit(1);}
    for(const target of platform==='all'?['ios','android']:[platform]){
      const args=[...(pnpmCli?[pnpmCli]:[]),'dlx',`eas-cli@${easCliVersion}`,'env:exec',profile.environment,`node ../../scripts/verify-native-release-config.mjs --platform ${target}`,'--non-interactive'];
      const code=await new Promise(resolveCode=>{
        const preflight=spawn(executable,args,{cwd:appDirectory,env:environment,shell:!pnpmCli&&process.platform==='win32',stdio:'inherit'});
        preflight.once('error',()=>resolveCode(1));preflight.once('exit',value=>resolveCode(value??1));
      });
      if(code!==0)process.exit(1);
    }
  }
}
const child = spawn(executable, commandArguments, {
  cwd: appDirectory,
  env: environment,
  // Node 24 no longer launches .cmd shims directly on Windows. Let cmd.exe
  // resolve the pnpm shim when this helper is invoked outside a pnpm script.
  shell: !pnpmCli && process.platform === "win32",
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`Unable to start EAS CLI: ${error.message}`);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`EAS CLI stopped after receiving ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
