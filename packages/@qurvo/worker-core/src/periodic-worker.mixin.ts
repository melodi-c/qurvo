import { OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export abstract class PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected abstract readonly intervalMs: number;
  protected abstract readonly initialDelayMs: number;
  protected abstract readonly logger: PinoLogger;

  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycleInFlight: Promise<void> | null = null;

  abstract runCycle(): Promise<void>;

  onApplicationBootstrap() {
    this.timer = setTimeout(() => this.scheduledCycle(), this.initialDelayMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.cycleInFlight) {
      await this.cycleInFlight;
    }
  }

  private async scheduledCycle(): Promise<void> {
    this.cycleInFlight = this.runCycle();
    try {
      await this.cycleInFlight;
    } catch (err) {
      this.logger.error({ err }, 'Cycle failed');
    } finally {
      this.cycleInFlight = null;
      if (!this.stopped) {
        this.timer = setTimeout(() => this.scheduledCycle(), this.intervalMs);
        this.timer.unref();
      }
    }
  }
}
