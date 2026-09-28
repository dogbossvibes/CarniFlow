// ANYVO-wide long-press-delete standardization audit (29.09.2026):
// app/dog/[id].tsx (the Dog Hub screen) has a very large dependency surface
// (useTrainingFeed, usePlan, useDogHubDynamic, useDogActiveFaehrte,
// DogHubScreen's own internals, …), making a full render-and-interact test
// expensive and brittle relative to what it would actually prove here. The
// two fixes made to this file are simple, source-verifiable prop wiring —
// `onDelete: isHeatOwner ? deleteHeat : undefined` and
// `onDelete: deleteCmd` — whose real behavior is already covered directly:
// DogHeatCard.delete-gating.test.tsx and DogCommandsCard.long-press-delete
// .test.tsx prove the child components correctly show/hide and wire the
// delete affordance based on whether onDelete is present; dog-heat's own
// getDogById-based ownership check is proven end-to-end in
// heat-detail-delete-consistency.test.tsx. This suite closes the remaining
// gap: that this specific file actually computes isHeatOwner from
// dog.owner_id/user.id and actually checks deleteHeatCycle's/deleteCommand's
// result before treating a delete as successful — read directly from source,
// the same "structural shell" style already used elsewhere in this codebase
// (e.g. app/dog-health-record/__tests__/weight-entry.test.tsx's Backpack-
// parity suite) when a full interaction test isn't practical.
import { readFileSync } from 'fs';

const content = readFileSync('app/dog/[id].tsx', 'utf8');

describe('app/dog/[id].tsx — heat delete ownership gating (29.09.2026 fix)', () => {
  it('computes isHeatOwner from dog.owner_id vs the session user, not left unconditional', () => {
    expect(content).toMatch(/const isHeatOwner = dog\?\.owner_id === user\?\.id;/);
  });

  it('passes onDelete to the heat card only when isHeatOwner — never unconditionally', () => {
    expect(content).toMatch(/onDelete:\s*isHeatOwner \? deleteHeat : undefined,/);
    expect(content).not.toMatch(/onDelete:\s*deleteHeat,/);
  });

  it('deleteHeat checks deleteHeatCycle\'s error before reloading — never silently "succeeds"', () => {
    const fn = content.match(/const deleteHeat = \(c: HeatCycle\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn).toMatch(/const \{ error \} = await deleteHeatCycle\(c\.id\);/);
    expect(fn).toMatch(/if \(error\) \{ showToast\(.*\); return; \}/);
  });
});

describe('app/dog/[id].tsx — command long-press delete (29.09.2026 addition)', () => {
  it('deleteCmd is wired to DogCommandsCard as onDelete', () => {
    expect(content).toMatch(/onDelete:\s*deleteCmd,/);
  });

  it('deleteCmd reuses the exact same confirmation copy already used by the command detail screen\'s own delete button', () => {
    const fn = content.match(/const deleteCmd = \(c: DogCommand\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn).toMatch(/t\('cmd\.deleteConfirm'\)/);
    expect(fn).toMatch(/„\$\{c\.name\}" wird entfernt\./);
  });

  it('deleteCmd targets exactly the selected command id via deleteCommand(id, c.id)', () => {
    const fn = content.match(/const deleteCmd = \(c: DogCommand\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn).toMatch(/deleteCommand\(id, c\.id\)/);
  });

  it('deleteCmd never mutates any other command — no bulk/list-wide delete call exists in this handler', () => {
    const fn = content.match(/const deleteCmd = \(c: DogCommand\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn).not.toMatch(/deleteCommand\(id\)(?!,)/); // never called with only dogId (no command id)
  });

  it('a failed local write is caught and reported, not left to silently pretend to have deleted', () => {
    const fn = content.match(/const deleteCmd = \(c: DogCommand\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(fn).toMatch(/catch \{ showToast\(/);
  });
});
