import { Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // ms before attempting recovery
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly logger = new Logger(CircuitBreaker.name);

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
    },
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T,
  ): Promise<T> {
    // 1. If OPEN, fail fast or try recovery
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.state = CircuitState.HALF_OPEN;
        this.logger.log(`Circuit ${this.name} entering HALF_OPEN state`);
      } else {
        this.logger.warn(`Circuit ${this.name} is OPEN, using fallback`);
        if (fallback) return fallback();
        throw new Error(`Circuit ${this.name} is open`);
      }
    }

    // 2. Attempt Operation
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();

      // FIX: Cast (this.state as CircuitState) to bypass TypeScript narrowing
      // TypeScript thinks state is still CLOSED/HALF_OPEN from the check at step 1
      if (fallback && (this.state as CircuitState) === CircuitState.OPEN) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.log(
          `CIRCUIT CLOSED: ${this.name} recovered. Normal operation resumed.`,
        );
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      if (this.state !== CircuitState.OPEN) {
        this.logger.warn(
          `Circuit OPENED: ${this.name} (Failures: ${this.failureCount}). Fallbacks active.`,
        );
      }
      this.state = CircuitState.OPEN;
    }
  }

  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.options.timeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime)
        : null,
    };
  }
}
