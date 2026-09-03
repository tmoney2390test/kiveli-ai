import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const appDirectory = join(repositoryRoot, "apps", "together");
const easArguments = process.argv.slice(2);

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
  : process.platform === "win32"
    ? "pnpm.cmd"
    : "pnpm";
const commandArguments = pnpmCli
  ? [pnpmCli, "dlx", "eas-cli@latest", ...easArguments]
  : ["dlx", "eas-cli@latest", ...easArguments];

const child = spawn(executable, commandArguments, {
  cwd: appDirectory,
  env: environment,
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
