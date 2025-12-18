import type { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger: Logger,
  operationName: string,
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      const isRetryable = (() => {
        const msg = (lastError.message || '').toLowerCase();
        const errorName = lastError.name.toLowerCase();

        if (
          config.retryableErrors?.some(
            (e) =>
              msg.includes(e.toLowerCase()) || errorName === e.toLowerCase(),
          )
        ) {
          return true;
        }

        const status = (error as any).status || (error as any).response?.status;

        if ([500, 502, 503, 504, 429].includes(status)) {
          return true;
        }

        return false;
      })();

      if (!isRetryable) {
        throw error;
      }

      if (attempt === config.maxAttempts) {
        logger?.error(
          `${operationName} failed after ${config.maxAttempts} attempts: ${lastError.message}`,
        );
        throw error;
      }

      logger?.warn(
        `${operationName} attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms...`,
      );

      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
