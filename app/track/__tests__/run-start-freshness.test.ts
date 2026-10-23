import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { isFreshStartTimestamp } from '@/features/tracking/utils/startFixFreshness';

// Execute the actual screen callbacks without mounting unrelated map/auth UI.
const text = fs.readFileSync(path.join(__dirname, '..', 'run.tsx'), 'utf8');
const source = ts.createSourceFile('run.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  function walk(n: ts.Node): ts.Node | undefined {
    if (predicate(n)) return n;
    return ts.forEachChild(n, walk);
  }
  return walk(source);
}
function callback(name: string): ts.Expression | null {
  const decl = find(n => ts.isVariableDeclaration(n) && n.name.getText(source) === name) as ts.VariableDeclaration | undefined;
  if (!decl || !decl.initializer || !ts.isCallExpression(decl.initializer)) return null;
  return decl.initializer.arguments[0];
}
function evaluate(expression: ts.Expression, context: Record<string, unknown>): (...args: unknown[]) => unknown {
  const code = ts.transpileModule(`module.exports = (${expression.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module: { exports: unknown } = { exports: undefined };
  vm.runInNewContext(code, { ...context, module });
  return module.exports as (...args: unknown[]) => unknown;
}
function context(ageMs: number) {
  const now = 1_000_000;
  const values: Record<string, unknown> = {
    Date: { now: () => now }, isFreshStartTimestamp,
    DEFAULT_APPROACH_CONFIG: { maxLocationAgeMs: 5000 },
    approachFixTimeRef: { current: now - ageMs },
    approachPhaseRef: { current: 'at_start' }, approachArmedRef: { current: true },
    startedRef: { current: false },
    // The transfer boundary must not even be entered on expired evidence.
    assertTransfer: jest.fn(() => { throw new Error('TRANSFER_BOUNDARY'); }),
    renderTransferIdentity: null,
    Alert: { alert: jest.fn() },
  };
  const proof = callback('hasFreshApproachFix');
  values.hasFreshApproachFix = proof ? evaluate(proof, values) : () => true;
  return values;
}
it.each(['manual-at-start', 'automatic-departure'])('blocks actual %s callback on expired evidence before any start side effects', mode => {
  const values = context(6000);
  evaluate(callback('beginSearchNow')!, values)(mode);
  expect(values.assertTransfer).not.toHaveBeenCalled();
  expect((values.startedRef as { current: boolean }).current).toBe(false);
});
it.each(['manual-at-start', 'automatic-departure', 'manual-override'])('preserves actual %s entry for fresh evidence or explicit override', mode => {
  const values = context(mode === 'manual-override' ? 60_000 : 0);
  evaluate(callback('beginSearchNow')!, values)(mode);
  expect(values.assertTransfer).toHaveBeenCalledTimes(1);
});
it('invalidates the actual queued reached voice when time expires without a render', () => {
  const valid = find(n => ts.isPropertyAssignment(n) && n.name.getText(source) === 'valid'
    && n.initializer.getText(source).includes('approachPhaseRef')) as ts.PropertyAssignment;
  expect(evaluate(valid.initializer, context(6000))()).toBe(false);
  expect(evaluate(valid.initializer, context(0))()).toBe(true);
});
