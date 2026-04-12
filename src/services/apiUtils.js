/**
 * Determines whether a caught error is a retryable rate-limit / quota error.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
  if (!(error instanceof Error) && typeof error !== 'object') return false;

  const msg    = (error?.message ?? '').toUpperCase();
  const status = error?.status ?? '';
  const code   = error?.code   ?? '';

  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA') ||
    msg.includes('RATE_LIMIT') ||
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
 *
 * CHANGE 6: Removed 'NOT_FOUND' from the non-retryable list.
 *
 * Previously, "models/gemini-1.5-flash is not found for API version v1beta"
 * was being swallowed by the NOT_FOUND check and thrown immediately with no
 * user-friendly message. By removing NOT_FOUND from this list, the error
 * propagates up to the caller where it can be caught and displayed properly.
 *
 * Also removed 'ALREADY_EXISTS' and 'FAILED_PRECONDITION' — these are not
 * Gemini API error codes and were causing confusion.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isNonRetryableError(error) {
  const status = error?.status;
  const code   = error?.code   ?? '';
  const msg    = (error?.message ?? '').toUpperCase();

  // 4xx errors except 429 (rate limit) are non-retryable.
  // CHANGE 6a: Keep this rule — it's correct for auth/bad-request errors.
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return true;
  }

  // CHANGE 6b: Only treat true auth/permission failures as non-retryable.
  // Removed: 'NOT_FOUND', 'ALREADY_EXISTS', 'FAILED_PRECONDITION', 'UNIMPLEMENTED'
  // Reason:   'NOT_FOUND' was silencing the "model not found" error that
  //           users need to see to diagnose API key / model availability issues.
  const nonRetryableCodes = [
    'UNAUTHENTICATED',
    'PERMISSION_DENIED',
    'INVALID_ARGUMENT',
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
 *
 * CHANGE 7: Added user-friendly quota error message.
 * When a quota error is exhausted after all retries, the error message is
 * enriched so the user knows exactly what happened and what to do.
 *
 * @template T
 * @param {() => Promise<T>} fn             The async operation to attempt.
 * @param {number}           [maxRetries=4] Maximum number of retry attempts.
 * @param {number}           [initialDelay=2000] Base delay in milliseconds.
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxRetries = 4, initialDelay = 2_000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable    = isRateLimitError(error) || isNetworkError(error);
      const nonRetryable = isNonRetryableError(error);

      // Hard failures — no point retrying.
      if (nonRetryable) {
        // CHANGE 7a: Enrich auth/permission errors with actionable message.
        const msg = (error?.message ?? '').toUpperCase();
        if (msg.includes('UNAUTHENTICATED') || msg.includes('PERMISSION_DENIED')) {
          throw Object.assign(
            new Error(
              'Gemini API key is invalid or does not have permission. ' +
              'Please check that VITE_GEMINI_API_KEY is set correctly in your ' +
              'Vercel environment variables and that the key was created in ' +
              'Google AI Studio (aistudio.google.com), not Google Cloud Console.'
            ),
            { cause: error }
          );
        }
        throw error;
      }

      // Exhausted retries or not a retryable error class.
      if (!retryable || attempt === maxRetries) {
        // CHANGE 7b: Enrich quota errors with actionable message.
        if (isRateLimitError(error)) {
          throw Object.assign(
            new Error(
              'Gemini API quota exceeded. This usually means:\n' +
              '• You have hit the free-tier per-minute limit — wait 60 seconds and try again.\n' +
              '• Billing is enabled but the quota for this project is still 0 — go to ' +
              'console.cloud.google.com → APIs & Services → Quotas and request an increase.\n' +
              '• The API key does not belong to the project with billing enabled.\n\n' +
              'Original error: ' + (error?.message ?? error)
            ),
            { cause: error }
          );
        }
        throw error;
      }

      // Exponential back-off with ±500 ms jitter to avoid thundering-herd.
      const jitter = (Math.random() - 0.5) * 1_000;
      const delay  = initialDelay * Math.pow(2, attempt) + jitter;

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
