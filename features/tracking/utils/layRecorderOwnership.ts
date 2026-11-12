// The visible tracking store is shared across hook instances. A fresh claim
// invalidates old async completions even for a different run of the same dog.
const owners = new WeakMap<object, symbol>();
export function claimLayRecorderStore(store: object): () => boolean {
  const owner = Symbol('lay-recorder');
  owners.set(store, owner);
  return () => owners.get(store) === owner;
}
