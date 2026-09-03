import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repositoryRoot, "apps", "together", "app");
const auditRoots = [
  appRoot,
  path.join(repositoryRoot, "apps", "together", "src", "components"),
  path.join(repositoryRoot, "apps", "together", "src", "shell"),
];
const rootLayout = path.join(appRoot, "_layout.tsx");
const appErrorBoundary = path.join(repositoryRoot, "apps", "together", "src", "components", "AppErrorBoundary.tsx");

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.[^.]+$/.test(entry.name)
      ? [absolute]
      : [];
  });
}

function routeForFile(file) {
  const relative = path.relative(appRoot, file).replaceAll("\\", "/").replace(/\.[^.]+$/, "");
  const segments = relative.split("/").filter((segment) => !/^\(.+\)$/.test(segment));
  if (["_layout", "+not-found", "+html"].includes(segments.at(-1))) return null;
  if (segments.at(-1) === "index") segments.pop();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

const routes = sourceFiles(appRoot).map(routeForFile).filter(Boolean);
const routePatterns = routes.map((route) => {
  const expression = route.split("/").map((segment) => {
    if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
    if (/^\[.+\]$/.test(segment)) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { route, regex: new RegExp(`^${expression}/?$`) };
});

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  return node;
}

function staticHref(node) {
  node = unwrap(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `__param__${span.literal.text}`).join("");
  }
  if (ts.isObjectLiteralExpression(node)) {
    const pathname = node.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText().replace(/["']/g, "") === "pathname");
    return pathname && ts.isPropertyAssignment(pathname) ? staticHref(pathname.initializer) : null;
  }
  return null;
}

function jsxAttribute(opening, name) {
  return opening.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === name);
}

function jsxHref(attribute) {
  if (!attribute?.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) return staticHref(attribute.initializer.expression);
  return null;
}

function wrappedByLinkAsChild(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxElement(current)) {
      const opening = current.openingElement;
      if (opening.tagName.getText() === "Link" && jsxAttribute(opening, "asChild")) return true;
    }
    current = current.parent;
  }
  return false;
}

function inertHandler(attribute) {
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return false;
  const expression = unwrap(attribute.initializer.expression);
  if (expression.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) return false;
  return ts.isBlock(expression.body) ? expression.body.statements.length === 0 : expression.body.kind === ts.SyntaxKind.UndefinedKeyword;
}

function normalizedAppPath(href) {
  if (!href || /^(?:https?:|mailto:|tel:|#)/.test(href)) return null;
  const withoutQuery = href.split(/[?#]/, 1)[0];
  if (!withoutQuery.startsWith("/")) return null;
  return withoutQuery.replaceAll(/\/\([^)]+\)/g, "").replaceAll("__param__", "value") || "/";
}

const failures = [];
const references = [];
let pressableCount = 0;
let customButtonCount = 0;
let interactiveElementCount = 0;

const rootLayoutSource = fs.readFileSync(rootLayout, "utf8");
if (!/installWebNavigationCompatibility\s*\(\s*router\s*\)/.test(rootLayoutSource)) {
  failures.push("apps/together/app/_layout.tsx must install the production-web navigation compatibility boundary.");
}
const appErrorBoundarySource = fs.readFileSync(appErrorBoundary, "utf8");
if (/<Boundary\b[^>]*\bkey\s*=/.test(appErrorBoundarySource)) {
  failures.push("AppErrorBoundary must not key the authenticated application by route; doing so remounts the persistent desktop shell.");
}

for (const file of auditRoots.flatMap(sourceFiles)) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const relative = path.relative(repositoryRoot, file).replaceAll("\\", "/");
  const report = (node, message) => {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    failures.push(`${relative}:${position.line + 1} ${message}`);
  };

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const onPress = jsxAttribute(node, "onPress");
      if (onPress) {
        interactiveElementCount += 1;
        if (inertHandler(onPress)) report(node, `${tag} has an empty action handler.`);
      }
      if (tag === "Pressable") {
        pressableCount += 1;
        const onLongPress = jsxAttribute(node, "onLongPress");
        const href = jsxAttribute(node, "href");
        const hasSpread = node.attributes.properties.some(ts.isJsxSpreadAttribute);
        if (!onPress && !onLongPress && !href && !hasSpread && !wrappedByLinkAsChild(node)) report(node, "Pressable has no action handler or Link wrapper.");
        if (inertHandler(onLongPress)) report(node, "Pressable has an empty long-press handler.");
      }
      if (/Button$/.test(tag) && tag !== "Pressable") {
        customButtonCount += 1;
        const hasSpread = node.attributes.properties.some(ts.isJsxSpreadAttribute);
        if (!onPress && !hasSpread && !wrappedByLinkAsChild(node)) report(node, `${tag} has no onPress handler or Link wrapper.`);
      }
      for (const attributeName of ["href", "route"]) {
        const href = jsxHref(jsxAttribute(node, attributeName));
        if (href) references.push({ href, node, source, relative });
      }
    }

    if (ts.isPropertyAssignment(node) && node.name.getText().replace(/["']/g, "") === "href") {
      const href = staticHref(node.initializer);
      if (href) references.push({ href, node, source, relative });
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression.getText();
      const method = node.expression.name.text;
      if (owner === "window.location" && ["assign", "replace"].includes(method)) {
        report(node, "internal app navigation must not reload the browser document; use Expo Router or navigateLocalRouteOnWeb.");
      }
      if ((owner === "router" && ["push", "replace", "navigate", "dismissTo"].includes(method)) ||
          (owner === "window.location" && ["assign", "replace"].includes(method))) {
        const href = node.arguments[0] ? staticHref(node.arguments[0]) : null;
        if (href) references.push({ href, node, source, relative });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

for (const reference of references) {
  const appPath = normalizedAppPath(reference.href);
  if (!appPath || routePatterns.some(({ regex }) => regex.test(appPath))) continue;
  const position = reference.source.getLineAndCharacterOfPosition(reference.node.getStart(reference.source));
  failures.push(`${reference.relative}:${position.line + 1} navigation points to missing route ${reference.href}.`);
}

if (failures.length) {
  console.error(`Navigation audit failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Navigation audit passed: ${interactiveElementCount} interactive elements (${pressableCount} Pressables, ${customButtonCount} custom buttons), ${references.length} static route references, ${routes.length} app routes.`);
}
