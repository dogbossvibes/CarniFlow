import { createBufferedPointWriter } from '../bufferedPointWriter';

it('finish waits for an earlier write and points appended during that write', async () => {
  let release!: () => void;
  const buffer = { current: [1, 2] };
  const write = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const writer = createBufferedPointWriter(buffer, write);
  const first = writer.flush();
  buffer.current.push(3);
  let completed = false;
  const finish = writer.flush().then(saved => { completed = true; return saved; });
  await Promise.resolve();
  expect(completed).toBe(false);
  release();
  expect(await first).toBe(true);
  expect(await finish).toBe(true);
  expect(write.mock.calls.map(([batch]) => batch)).toEqual([[1, 2], [3]]);
  expect(buffer.current).toEqual([]);
});

it('reports a failed in-flight write to every waiter and retries in order', async () => {
  let reject!: (error: Error) => void;
  const buffer = { current: [1] };
  const write = jest.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
  const writer = createBufferedPointWriter(buffer, write);
  const first = writer.flush();
  buffer.current.push(2);
  const finish = writer.flush();
  reject(new Error('disk unavailable'));
  expect(await first).toBe(false);
  expect(await finish).toBe(false);
  expect(buffer.current).toEqual([1, 2]);
  expect(await writer.flush()).toBe(true);
  expect(write.mock.calls[1][0]).toEqual([1, 2]);
});


it('does not report an empty earlier flush as success for a newly appended tail', async () => {
  const buffer = { current: [] as number[] };
  const write = jest.fn(async () => {});
  const writer = createBufferedPointWriter(buffer, write);
  const empty = writer.flush();
  buffer.current.push(1);
  expect(await writer.flush()).toBe(true);
  expect(await empty).toBe(true);
  expect(write).toHaveBeenCalledWith([1]);
  expect(buffer.current).toEqual([]);
});
