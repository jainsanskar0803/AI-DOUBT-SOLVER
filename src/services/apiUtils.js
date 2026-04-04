/**
 * Determines whether a caught error is a retryable rate-limit / quota error.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
  if (!(error instanceof Error) && typeof error !== 'object') return false;

  const msg = (error?.message ?? '').toUpperCase();
  const status = error?.status ?? '';
  const code = error?.code ?? '';

  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA') ||
    status === 'RESOURCE_EXHAUSTED' ||
    status === 429 ||
    code === 'RESOURCE_EXHAUSTED'
  );
}

/**
 * Determines whether a caught error is a transient network error worth retrying.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isNetworkError(error) {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('socket')
  );
}

/**
 * Determines whether an error is a hard failure that should NOT be retried.
 * Examples: authentication errors, bad requests, not-found.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isNonRetryableError(error) {
  const status = error?.status;
  const code = error?.code ?? '';
  const msg = (error?.message ?? '').toUpperCase();

  // 4xx errors (except 429 which is handled separately) are non-retryable.
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return true;
  }

  const nonRetryableCodes = [
    'UNAUTHENTICATED',
    'PERMISSION_DENIED',
    'INVALID_ARGUMENT',
    'NOT_FOUND',
    'ALREADY_EXISTS',
    'FAILED_PRECONDITION',
    'UNIMPLEMENTED',
  ];

  if (nonRetryableCodes.some((c) => code.includes(c) || msg.includes(c))) {
    return true;
  }

  return false;
}

/**
 * Wraps an async function with exponential back-off retry logic.
 *
 * Retries on:
 * - Rate limit / quota errors (429 / RESOURCE_EXHAUSTED)
 * - Transient network errors
 *
 * Does NOT retry on:
 * - Authentication / permission errors
 * - Invalid argument / bad request errors
 * - Any other 4xx (except 429)
 *
 * @template T
 * @param {() => Promise<T>} fn            The async operation to attempt.
 * @param {number}           [maxRetries=5] Maximum number of retry attempts.
 * @param {number}           [initialDelay=2000] Base delay in milliseconds.
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxRetries = 5, initialDelay = 2_000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable = isRateLimitError(error) || isNetworkError(error);
      const nonRetryable = isNonRetryableError(error);

      // Hard failures — no point retrying.
      if (nonRetryable) {
        throw error;
      }

      // Exhausted retries or not a retryable error class.
      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential back-off with ±500 ms jitter to avoid thundering-herd.
      const jitter = (Math.random() - 0.5) * 1_000;
      const delay = initialDelay * Math.pow(2, attempt) + jitter;

      console.warn(
        `[withRetry] Retryable error on attempt ${attempt + 1}/${maxRetries}. ` +
        `Retrying in ${Math.round(delay)} ms…`,
        error?.message ?? error
      );

      await new Promise((resolve) => setTimeout(resolve, Math.max(delay, 0)));
    }
  }

  throw lastError;
}

