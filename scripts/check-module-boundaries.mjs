import { readFileSync, readdirSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const apiRoot = 'apps/together/src/lib/api/';
const chatRoot = 'apps/together/src/features/chat/';
const facadePath = 'apps/together/src/lib/api.ts';
const componentsRoot = 'apps/together/src/components';
const scoped = (path) => path === facadePath || path.startsWith(apiRoot) || path.startsWith(chatRoot);

// Intentionally scoped to migrated modules. Expand coverage as other features
// acquire clear boundaries; do not grandfather new violations in these modules.
export function inspectModuleBoundaries(files) {
  const errors = [];
  const graph = new Map();
  for (const [file, content] of files) {
    if (!file.startsWith('apps/together/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    graph.set(file, []);
    if (file === facadePath && source.statements.some((node) => !ts.isExportDeclaration(node))) {
      errors.push(`${file}: compatibility facade may only re-export feature APIs`);
    }
    const visit = (node) => {
      let specifier;
      let runtime = true;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        specifier = node.moduleSpecifier;
        runtime = !node.isTypeOnly && !node.importClause?.isTypeOnly;
        const bindings = node.importClause?.namedBindings ?? node.exportClause;
        if (bindings && ts.isNamedImports(bindings) && !node.importClause?.name && bindings.elements.every((element) => element.isTypeOnly)) runtime = false;
        if (bindings && ts.isNamedExports(bindings) && bindings.elements.every((element) => element.isTypeOnly)) runtime = false;
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        specifier = node.arguments[0];
      }
      if (specifier && ts.isStringLiteral(specifier)) {
        const request = specifier.text;
        const target = request.startsWith('.')
          ? posix.normalize(posix.join(posix.dirname(file), request))
          : request.startsWith('@/') ? `apps/together/src/${request.slice(2)}` : null;
        if (target) {
          const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`];
          const resolved = candidates.find((candidate) => files.has(candidate)) ?? target;
          if (scoped(file) && file !== facadePath && (resolved === facadePath || target === facadePath.slice(0, -3))) {
            errors.push(`${file}: import the owning API module instead of the compatibility facade`);
          }
          if (runtime && [componentsRoot, `${componentsRoot}/index`, `${componentsRoot}/index.ts`].includes(target)) {
            errors.push(`${file}: import the owning component module; the shared barrel pulls unrelated UI into startup`);
          }
          if (file.startsWith(chatRoot) && target.startsWith('apps/together/app/')) {
            errors.push(`${file}: feature modules must not import Expo route implementations`);
          }
          if (file.startsWith(apiRoot) && (target.startsWith('apps/together/app/') || target.startsWith(chatRoot) || target.startsWith('apps/together/src/store/'))) {
            errors.push(`${file}: API modules must not depend on routes, chat UI or application stores`);
          }
          if (runtime && scoped(resolved)) graph.get(file).push(resolved);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const complete = new Set(), visiting = new Set();
  const walk = (file, path) => {
    if (visiting.has(file)) {
      errors.push(`Runtime import cycle: ${[...path.slice(path.indexOf(file)), file].join(' -> ')}`);
      return;
    }
    if (complete.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) walk(dependency, [...path, file]);
    visiting.delete(file);
    complete.add(file);
  };
  for (const file of graph.keys()) walk(file, []);
  return errors;
}

function readModules(root) {
  const files = new Map([[facadePath, readFileSync(resolve(root, facadePath), 'utf8')]]);
  for (const directory of ['apps/together/src/', 'apps/together/app/']) {
    const collect = (relative) => {
      for (const entry of readdirSync(resolve(root, relative), { withFileTypes: true })) {
        const file = posix.join(relative, entry.name);
        if (entry.isDirectory()) collect(file);
        else if (/\.tsx?$/.test(entry.name)) files.set(file, readFileSync(resolve(root, file), 'utf8'));
      }
    };
    collect(directory);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = readModules(root);
  const errors = inspectModuleBoundaries(files);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Module boundaries passed (${files.size} files; scoped API/chat rules and client component imports).`);
}
