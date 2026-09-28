/**
 * Lightweight DB & API query timing diagnostic utility.
 * Helps observe slow queries directly in Vercel Runtime Logs.
 * 
 * To disable completely at runtime, set environment variable ENABLE_PERF_LOGS=false
 */
export async function timedQuery<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const isEnabled = process.env.ENABLE_PERF_LOGS !== 'false';
  if (!isEnabled) {
    return await fn();
  }

  const start = performance.now();
  try {
    const result = await fn();
    const duration = (performance.now() - start).toFixed(1);
    console.log(`[DB_PERF] ${name} executed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = (performance.now() - start).toFixed(1);
    console.error(`[DB_PERF_ERROR] ${name} failed after ${duration}ms:`, error);
    throw error;
  }
}
