/**
 * Type-aware audit for mishandled Promises.
 *
 * Uses the TypeScript compiler API rather than pattern matching, so findings
 * come from actual types rather than a hand-maintained list of function names.
 * It targets three bugs the compiler itself permits:
 *
 *   1. FLOATING    — server-side code evaluates a Promise and discards it. The
 *                    work races against what follows, or never completes at all
 *                    if a serverless function is frozen when the response ends.
 *
 *   2. SERIALIZED  — a Promise is put in an object literal. JSON.stringify
 *                    renders it as {}, so the client gets an empty object.
 *                    NextResponse.json() takes `any`, so nothing complains.
 *
 *   3. RENDERED    — a Promise is used as a JSX child. React throws error #31,
 *                    "Objects are not valid as a React child", at runtime.
 *
 * Deliberately NOT flagged:
 *   - `void foo()`                    — an explicit discard
 *   - `foo().then()/.catch()`         — the result is handled
 *   - `x = foo()`                     — the promise is stored, not dropped
 *   - unawaited calls in client       — idiomatic React in effects and event
 *     components                        handlers; not a correctness bug
 *
 * Usage: node scripts/check-promises.mjs
 */
import ts from 'typescript';
import { relative } from 'node:path';

const cwd = process.cwd();
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, cwd);

const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const findings = { floating: [], serialized: [], rendered: [] };

/** True when this single type is a Promise or otherwise thenable. */
function isThenable(t) {
  if (!t) return false;
  if (t.getSymbol?.()?.getName() === 'Promise') return true;
  const then = t.getProperty?.('then');
  if (then) {
    const decl = then.valueDeclaration ?? then.declarations?.[0];
    if (decl && (ts.isMethodSignature(decl) || ts.isMethodDeclaration(decl))) return true;
  }
  return false;
}

/**
 * True only when a value is unambiguously a Promise.
 *
 * Every constituent of a union must be thenable. This matters because
 * @types/react 18.3 folds `Promise<AwaitedReactNode>` into the `ReactNode`
 * union for async server components — so a plain `children: ReactNode` contains
 * a Promise member and a naive "does any member look thenable" test flags every
 * layout in the app. Requiring *all* members to be thenable keeps
 * `Promise<string>` flagged while leaving `ReactNode` alone.
 */
function isPromiseLike(type) {
  if (!type) return false;
  const parts = type.isUnion?.() ? type.types : [type];
  // Null/undefined are ignorable in an otherwise-Promise union (`Promise<T> | null`).
  const meaningful = parts.filter(
    (t) => !(t.getFlags() & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
  if (meaningful.length === 0) return false;
  return meaningful.every(isThenable);
}

function location(node) {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  return `${relative(cwd, sf.fileName)}:${line + 1}`;
}

const snippet = (node) => node.getText().replace(/\s+/g, ' ').slice(0, 95);

/**
 * Client components opt out of the floating-promise check: calling an async
 * function without awaiting it inside useEffect or an onClick is ordinary
 * React, not a defect.
 */
function isClientComponent(sourceFile) {
  const first = sourceFile.statements[0];
  return (
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'
  );
}

for (const sourceFile of program.getSourceFiles()) {
  const file = relative(cwd, sourceFile.fileName);
  if (sourceFile.isDeclarationFile) continue;
  if (!/^(app|lib|components)\//.test(file)) continue;

  const serverSide = !isClientComponent(sourceFile);

  const visit = (node) => {
    // --- 1. Floating promises (server-side only) -------------------------
    if (serverSide && ts.isExpressionStatement(node)) {
      const expr = node.expression;
      const isAssignment =
        ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      const isHandledChain =
        ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        ['then', 'catch', 'finally'].includes(expr.expression.name.text);

      if (
        !ts.isVoidExpression(expr) &&
        !ts.isAwaitExpression(expr) &&
        !isAssignment &&
        !isHandledChain &&
        isPromiseLike(checker.getTypeAtLocation(expr))
      ) {
        findings.floating.push(`${location(node)}  ${snippet(node)}`);
      }
    }

    // --- 2. Promises inside object literals ------------------------------
    if (ts.isPropertyAssignment(node) && node.initializer) {
      if (isPromiseLike(checker.getTypeAtLocation(node.initializer))) {
        findings.serialized.push(`${location(node)}  ${snippet(node)}`);
      }
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      if (isPromiseLike(checker.getTypeAtLocation(node.name))) {
        findings.serialized.push(`${location(node)}  ${snippet(node)}`);
      }
    }

    // --- 3. Promises as JSX children -------------------------------------
    if (ts.isJsxExpression(node) && node.expression) {
      const p = node.parent;
      const isChild =
        p && (ts.isJsxElement(p) || ts.isJsxFragment(p) || ts.isJsxSelfClosingElement(p));
      if (isChild && isPromiseLike(checker.getTypeAtLocation(node.expression))) {
        findings.rendered.push(`${location(node)}  ${snippet(node)}`);
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
}

const labels = {
  floating: [
    'FLOATING PROMISES — result discarded, so the work races or is lost entirely',
    'Add `await`, or `void` if it is genuinely fire-and-forget.',
  ],
  serialized: [
    'PROMISES IN OBJECT LITERALS — JSON.stringify turns these into {}',
    'Await the value before placing it in the object.',
  ],
  rendered: [
    'PROMISES AS JSX CHILDREN — React throws error #31 on these',
    'Resolve the value in state before rendering it.',
  ],
};

let total = 0;
for (const [key, items] of Object.entries(findings)) {
  if (!items.length) continue;
  total += items.length;
  const [title, hint] = labels[key];
  console.error(`\n${title}\n`);
  for (const item of items) console.error('  ' + item);
  console.error(`\n  → ${hint}`);
}

if (total === 0) {
  console.log('No mishandled Promises found.');
  process.exit(0);
}
console.error(`\n${total} issue(s) found.\n`);
process.exit(1);
