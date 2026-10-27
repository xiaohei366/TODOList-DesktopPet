import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ScheduledTodoScheduler } from '../src/main/scheduledTodoScheduler';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('scheduled TODO scheduler', () => {
  const schedulers: ScheduledTodoScheduler[] = [];

  function create(options: ConstructorParameters<typeof ScheduledTodoScheduler>[0]): ScheduledTodoScheduler {
    const scheduler = new ScheduledTodoScheduler(options);
    schedulers.push(scheduler);
    return scheduler;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 9, 29, 30));
  });

  afterEach(() => {
    schedulers.splice(0).forEach((scheduler) => scheduler.stop());
    vi.useRealTimers();
  });

  test('fires the next future occurrence on time and removes the timer when no rules remain', async () => {
    const dueAt = new Date(Date.now() + 30_000);
    let generated = false;
    const checkDue = vi.fn(async () => { if (Date.now() >= dueAt.getTime()) generated = true; });
    const scheduler = create({ checkDue, nextRun: async () => generated ? null : dueAt, onError: vi.fn() });

    await scheduler.checkNow();
    expect(checkDue).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(generated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(generated).toBe(true);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('rechecks distant schedules at least once per minute using the current wall clock', async () => {
    const dueAt = new Date(Date.now() + 3_600_000);
    const checkDue = vi.fn(async () => {});
    const nextRun = vi.fn(async (_now: Date) => dueAt);
    const scheduler = create({ checkDue, nextRun, onError: vi.fn() });

    await scheduler.checkNow();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(checkDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(nextRun.mock.calls[1][0].getTime()).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
  });

  test('does not poll when there are no enabled schedules', async () => {
    const checkDue = vi.fn(async () => {});
    const scheduler = create({ checkDue, nextRun: async () => null, onError: vi.fn() });

    await scheduler.checkNow();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(checkDue).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('retries a failed due check after 30 seconds instead of losing its occurrence', async () => {
    const error = new Error('temporary TODO write failure');
    const checkDue = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const nextRun = vi.fn(async () => null);
    const onError = vi.fn();
    const scheduler = create({ checkDue, nextRun, onError });

    await expect(scheduler.checkNow()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(error);
    expect(nextRun).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(checkDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('also retries failures while reading the next occurrence', async () => {
    const error = new Error('temporary rules read failure');
    const checkDue = vi.fn(async () => {});
    const nextRun = vi.fn<() => Promise<Date | null>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(null);
    const onError = vi.fn();
    const scheduler = create({ checkDue, nextRun, onError });

    await scheduler.checkNow();
    expect(onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(nextRun).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('serializes overlapping requests so the same occurrence is generated once', async () => {
    const gate = deferred();
    let generated = 0;
    let active = 0;
    let maximumActive = 0;
    const checkDue = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const alreadyGenerated = generated > 0;
      await gate.promise;
      if (!alreadyGenerated) generated += 1;
      active -= 1;
    });
    const scheduler = create({ checkDue, nextRun: async () => null, onError: vi.fn() });

    const first = scheduler.checkNow();
    const second = scheduler.checkNow();
    await Promise.resolve();
    expect(checkDue).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
    expect(generated).toBe(1);
  });

  test('a rule mutation immediately after the due time still checks the pending occurrence', async () => {
    const dueAt = new Date(2026, 9, 27, 9, 30);
    let generated = 0;
    const scheduler = create({
      checkDue: async () => { if (Date.now() >= dueAt.getTime() && generated === 0) generated += 1; },
      nextRun: async (now) => generated > 0 ? null : new Date(Math.max(now.getTime(), dueAt.getTime())),
      onError: vi.fn()
    });

    await scheduler.checkNow();
    // Change wall time without running the old timer, as when a mutation races its callback.
    vi.setSystemTime(new Date(2026, 9, 27, 9, 30, 0, 500));
    await scheduler.checkNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(generated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('uses an injected clock when calculating its next timeout', async () => {
    let now = new Date(2026, 9, 27, 10, 0);
    const dueAt = new Date(now.getTime() + 5_000);
    const checkDue = vi.fn(async () => {});
    const nextRun = vi.fn(async (current: Date) => current.getTime() >= dueAt.getTime() ? null : dueAt);
    const scheduler = create({ checkDue, nextRun, onError: vi.fn(), now: () => now });

    await scheduler.checkNow();
    now = dueAt;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(checkDue).toHaveBeenCalledTimes(2);
    expect(nextRun.mock.calls[0][0]).toEqual(new Date(2026, 9, 27, 10, 0));
    expect(nextRun.mock.calls[1][0]).toEqual(dueAt);
    scheduler.stop();
  });

  test('stop cancels a waiting timer and ignores later check requests', async () => {
    const checkDue = vi.fn(async () => {});
    const scheduler = create({ checkDue, nextRun: async () => new Date(Date.now() + 1_000), onError: vi.fn() });

    await scheduler.checkNow();
    scheduler.stop();
    await scheduler.checkNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(checkDue).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('stop skips queued work and does not rearm after an in-flight check', async () => {
    const gate = deferred();
    const checkDue = vi.fn(async () => gate.promise);
    const nextRun = vi.fn(async () => new Date(Date.now() + 1_000));
    const scheduler = create({ checkDue, nextRun, onError: vi.fn() });

    const first = scheduler.checkNow();
    const queued = scheduler.checkNow();
    await Promise.resolve();
    scheduler.stop();
    gate.resolve();
    await Promise.all([first, queued]);
    expect(checkDue).toHaveBeenCalledTimes(1);
    expect(nextRun).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('stop during a next-occurrence read prevents rearming its timer', async () => {
    const gate = deferred();
    const nextRun = vi.fn(async () => { await gate.promise; return new Date(Date.now() + 1_000); });
    const scheduler = create({ checkDue: async () => {}, nextRun, onError: vi.fn() });

    const running = scheduler.checkNow();
    await Promise.resolve();
    await Promise.resolve();
    expect(nextRun).toHaveBeenCalledTimes(1);
    scheduler.stop();
    gate.resolve();
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });
});
