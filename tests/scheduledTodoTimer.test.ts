import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getNextScheduledRunDate, runDueScheduledTodos, ScheduledTodoStore } from '../src/main/scheduledTodos';
import type { ScheduledTodoInput, ScheduledTodoRule } from '../src/shared/types';

const today = '2026-10-27';
const ruleBase = {
  id: 'scheduled-rule',
  target: 'todo' as const,
  enabled: true,
  text: 'Scheduled task',
  hour: 9,
  minute: 30,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z'
};

const weeklyRule: ScheduledTodoRule = { ...ruleBase, kind: 'weekly', weekdays: [2, 3] };
const oneTimeRule: ScheduledTodoRule = { ...ruleBase, kind: 'one-time', date: today };

describe('getNextScheduledRunDate', () => {
  test.each([weeklyRule, oneTimeRule])('keeps a due $kind run eligible at and just after its scheduled time', (rule) => {
    for (const now of [new Date(2026, 9, 27, 9, 30), new Date(2026, 9, 27, 9, 30, 0, 500)]) {
      expect(getNextScheduledRunDate([rule], now)).toEqual(now);
    }
  });

  test('skips an already generated weekly run even if its scheduled time is still ahead today', () => {
    const rule = { ...weeklyRule, lastGeneratedDate: today };
    const tomorrow = new Date(2026, 9, 28, 9, 30);

    expect(getNextScheduledRunDate([rule], new Date(2026, 9, 27, 9, 0))).toEqual(tomorrow);
    expect(getNextScheduledRunDate([rule], new Date(2026, 9, 27, 10, 0))).toEqual(tomorrow);
  });

  test('allows the next local day after a weekly run was generated yesterday', () => {
    const now = new Date(2026, 9, 28, 10, 0);

    expect(getNextScheduledRunDate([{ ...weeklyRule, lastGeneratedDate: today }], now)).toEqual(now);
  });

  test.each([weeklyRule, oneTimeRule])('ignores a disabled $kind rule', (rule) => {
    expect(getNextScheduledRunDate([{ ...rule, enabled: false }], new Date(2026, 9, 27, 10, 0))).toBeNull();
  });

  test('ignores fired or already generated one-time rules and does not backfill earlier dates', () => {
    const now = new Date(2026, 9, 27, 10, 0);

    expect(getNextScheduledRunDate([{ ...oneTimeRule, fired: true }], now)).toBeNull();
    expect(getNextScheduledRunDate([{ ...oneTimeRule, lastGeneratedDate: today }], now)).toBeNull();
    expect(getNextScheduledRunDate([{ ...oneTimeRule, date: '2026-10-26' }], now)).toBeNull();
  });

  test('retains a future one-time run and selects the earliest eligible rule', () => {
    const now = new Date(2026, 9, 27, 9, 0);
    const later = { ...oneTimeRule, date: '2026-10-28' };

    expect(getNextScheduledRunDate([later], now)).toEqual(new Date(2026, 9, 28, 9, 30));
    expect(getNextScheduledRunDate([later, weeklyRule], now)).toEqual(new Date(2026, 9, 27, 9, 30));
  });
});

describe('rescheduling due rules', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tolist-schedule-timer-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const inputs: ScheduledTodoInput[] = [
    { kind: 'weekly', text: 'Due weekly task', hour: 9, minute: 30, weekdays: [2, 3] },
    { kind: 'one-time', target: 'reminder', text: 'Due reminder', hour: 9, minute: 30, date: today }
  ];

  test.each(inputs)('keeps the due $kind run scheduled after deleting another rule', async (input) => {
    const now = new Date(2026, 9, 27, 9, 30, 0, 500);
    const store = new ScheduledTodoStore(join(dir, 'scheduled-todos.json'), () => now);
    await store.create(input);
    const other = await store.create({ kind: 'one-time', text: 'Unrelated task', hour: 12, minute: 0, date: '2026-10-28' });

    await store.delete(other.id);

    expect(getNextScheduledRunDate(await store.list(), now)).toEqual(now);
  });

  test.each(inputs)('can retry a failed $kind run and then stops scheduling it for today', async (input) => {
    const now = new Date(2026, 9, 27, 10, 0);
    const store = new ScheduledTodoStore(join(dir, 'scheduled-todos.json'), () => now);
    await store.create(input);
    const add = vi.fn().mockRejectedValueOnce(new Error('Temporary storage failure')).mockResolvedValue({ id: 'created-todo' });

    await expect(runDueScheduledTodos(store, { add }, now)).rejects.toThrow('Temporary storage failure');
    expect(getNextScheduledRunDate(await store.list(), now)).toEqual(now);

    await expect(runDueScheduledTodos(store, { add }, now)).resolves.toBe(1);
    const next = getNextScheduledRunDate(await store.list(), now);
    expect(next).toEqual(input.kind === 'weekly' ? new Date(2026, 9, 28, 9, 30) : null);
    await expect(runDueScheduledTodos(store, { add }, now)).resolves.toBe(0);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
