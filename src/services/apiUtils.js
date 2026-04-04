/**
 * Utility for API calls with exponential backoff retry logic.
 */

export async function withRetry(fn, maxRetries = 5, initialDelay = 2000) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if it's a rate limit error (429)
      const errorStr = JSON.stringify(error).toUpperCase();
      const isRateLimit = 
        error.message?.includes('429') || 
        error.status === 'RESOURCE_EXHAUSTED' ||
        errorStr.includes('429') ||
        errorStr.includes('RESOURCE_EXHAUSTED') ||
        errorStr.includes('QUOTA');
      
      if (!isRateLimit || i === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: delay * 2^retry
      // We add some jitter to avoid synchronized retries
      const jitter = Math.random() * 1000;
      const delay = (initialDelay * Math.pow(2, i)) + jitter;
      
      console.warn(`Rate limit hit (429). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
