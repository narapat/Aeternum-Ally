// @ts-check

export const NETLIFY_SYNC_LIMIT_MS = 60_000;
export const AI_REQUEST_FENCE_MS = 50_000;

/**
 * Leave time for usage and error logging before Netlify's synchronous limit.
 * @template T
 * @param {Promise<T>} request
 * @param {string} action
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
export function withAIRequestFence(
  request,
  action,
  timeoutMs = AI_REQUEST_FENCE_MS,
) {
  let fenceId;
  const fence = new Promise((_, reject) => {
    fenceId = setTimeout(() => {
      const error = new Error(
        `Action '${action}' exceeded the ${timeoutMs / 1000}s timeout`,
      );
      // @ts-ignore -- consumed by api.ts when mapping timeout responses.
      error.isTimeout = true;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([request, fence]).finally(() => clearTimeout(fenceId));
}
