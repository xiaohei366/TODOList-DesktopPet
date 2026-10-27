type ScheduledTodoSchedulerOptions = {
  checkDue: () => Promise<void>;
  nextRun: (now: Date) => Promise<Date | null>;
  onError: (error: unknown) => void;
  now?: () => Date;
};

const maxWaitMs = 60_000;
const retryDelayMs = 30_000;

/** Serializes schedule checks and keeps a recoverable timer after transient failures. */
export class ScheduledTodoScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();
  private stopped = false;
  private readonly now: () => Date;

  constructor(private readonly options: ScheduledTodoSchedulerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  checkNow(): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }
    this.clearTimer();
    this.queue = this.queue.then(() => this.runCheck());
    return this.queue;
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private armTimer(delay: number): void {
    this.clearTimer();
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.checkNow();
    }, delay);
  }

  private async runCheck(): Promise<void> {
    this.clearTimer();
    if (this.stopped) {
      return;
    }
    try {
      await this.options.checkDue();
      if (this.stopped) {
        return;
      }
      const next = await this.options.nextRun(this.now());
      if (!this.stopped && next) {
        // Periodically reconsider local time without a permanent polling timer when no rules remain.
        this.armTimer(Math.max(0, Math.min(maxWaitMs, next.getTime() - this.now().getTime())));
      }
    } catch (error) {
      if (this.stopped) {
        return;
      }
      try {
        this.options.onError(error);
      } catch {
        // Error reporting must not disable the scheduler's recovery timer.
      }
      this.armTimer(retryDelayMs);
    }
  }
}
