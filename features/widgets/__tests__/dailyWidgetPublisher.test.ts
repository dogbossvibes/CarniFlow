import { createDailyWidgetPublisher, type WidgetRead } from '../dailyWidgetPublisher';

const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const data: WidgetRead = { dogs: [{ id: 'dog-a', name: 'Rex', owner_id: 'a' }], events: [] };
const setup = () => {
  let gen = 0;
  const transport = { isAvailable: () => true, beginSession: jest.fn<string, [string | null]>(() => `t${++gen}`),
    updateSnapshot: jest.fn<Promise<boolean>, [string, number, string]>(async () => true),
    updateAvailability: jest.fn<Promise<boolean>, [string, number, 'offline' | 'error']>(async () => true) };
  const read = jest.fn(async (): Promise<WidgetRead> => data);
  const online = jest.fn(async () => true);
  const publisher = createDailyWidgetPublisher({ transport, read, online, now: () => Date.parse('2026-10-14T10:00:00Z'), timeZone: () => 'UTC' });
  return { transport, read, online, publisher };
};
it('invalidates synchronously on logout and discards a late old read', async () => {
  const x = setup(); let resolve!: (d: WidgetRead) => void;
  x.read.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  x.publisher.setIdentity('a'); await settle();
  x.publisher.setIdentity(null);
  expect(x.transport.beginSession).toHaveBeenLastCalledWith(null);
  resolve(data); await settle(); expect(x.transport.updateSnapshot).not.toHaveBeenCalled();
});
it('A → B → A never accepts an older generation even when the account ID matches again', async () => {
  const x = setup(); let resolveOld!: (d: WidgetRead) => void;
  x.read.mockImplementationOnce(() => new Promise(r => { resolveOld = r; }));
  x.publisher.setIdentity('a'); await settle(); x.publisher.setIdentity('b'); await settle(); x.publisher.setIdentity('a'); await settle();
  resolveOld(data); await settle();
  expect(x.transport.updateSnapshot.mock.calls.map(call => call[0])).toEqual(['t2', 't3']);
});
it('coalesces overlapping refreshes and produces increasing sequences', async () => {
  const x = setup(); let release!: (d: WidgetRead) => void;
  x.read.mockImplementationOnce(() => new Promise(r => { release = r; }));
  x.publisher.setIdentity('a'); await settle();
  await Promise.all([x.publisher.refresh(), x.publisher.refresh()]);
  expect(x.read).toHaveBeenCalledTimes(1);
  release(data); await settle();
  expect(x.read).toHaveBeenCalledTimes(2);
  expect(x.transport.updateSnapshot.mock.calls.map(call => call[1])).toEqual([1, 2]);
});
it('keeps offline/error separate from a successful empty snapshot', async () => {
  const x = setup(); x.online.mockResolvedValue(false);
  x.publisher.setIdentity('a'); await settle();
  expect(x.transport.updateAvailability).toHaveBeenLastCalledWith('t1', 1, 'offline');
  expect(x.read).not.toHaveBeenCalled(); expect(x.transport.updateSnapshot).not.toHaveBeenCalled();
  x.online.mockResolvedValue(true); x.read.mockRejectedValueOnce(new Error('failed'));
  await x.publisher.refresh();
  expect(x.transport.updateAvailability).toHaveBeenLastCalledWith('t1', 2, 'error');
  expect(x.transport.updateSnapshot).not.toHaveBeenCalled();
});
it('source deletion clears derived cache before waiting for a new read', async () => {
  const x = setup(); x.publisher.setIdentity('a'); await settle();
  x.online.mockResolvedValue(false); x.publisher.invalidate();
  expect(x.transport.beginSession.mock.calls.map(call => call[0])).toEqual(['a', null, 'a']);
  await settle(); expect(x.transport.updateAvailability).toHaveBeenLastCalledWith('t3', 1, 'offline');
});
it('does not clear valid same-user data on repeated auth events, and dispose rejects old responses', async () => {
  const x = setup(); let resolve!: (d: WidgetRead) => void;
  x.read.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  x.publisher.setIdentity('a'); x.publisher.setIdentity('a'); await settle();
  expect(x.transport.beginSession).toHaveBeenCalledTimes(1);
  x.publisher.dispose(); resolve(data); await settle(); expect(x.transport.updateSnapshot).not.toHaveBeenCalled();
});
it('marks native rejection as error without trying to restore a revoked token authority', async () => {
  const x = setup(); x.transport.updateSnapshot.mockResolvedValue(false);
  x.publisher.setIdentity('a'); await settle();
  expect(x.transport.updateAvailability).toHaveBeenLastCalledWith('t1', 2, 'error');
  expect(x.transport.beginSession).toHaveBeenCalledTimes(1);
});
