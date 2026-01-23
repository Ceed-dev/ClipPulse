/**
 * Retry.js
 * Reliability hardening with retries and exponential backoff
 *
 * Specification Phase 8:
 * - Add retries (429/5xx with exponential backoff)
 * - Add run failure recovery
 */

/**
 * HTTP status codes that should trigger a retry
 */
const RETRYABLE_STATUS_CODES = [
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504  // Gateway Timeout
];

/**
 * Execute a function with retry logic
 * @param {function} fn - The function to execute
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries] - Maximum retry attempts
 * @param {number} [options.baseDelayMs] - Base delay in milliseconds
 * @param {number} [options.maxDelayMs] - Maximum delay in milliseconds
 * @param {function} [options.shouldRetry] - Custom function to determine if should retry
 * @returns {*} The function result
 */
function withRetry(fn, options = {}) {
  const config = getOperationalConfig();

  const maxRetries = options.maxRetries || config.maxRetries || 3;
  const baseDelayMs = options.baseDelayMs || config.retryBackoffMs || 1000;
  const maxDelayMs = options.maxDelayMs || 30000;
  const shouldRetry = options.shouldRetry || defaultShouldRetry;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (e) {
      lastError = e;

      if (attempt >= maxRetries) {
        console.error(`All ${maxRetries + 1} attempts failed:`, e);
        throw e;
      }

      if (!shouldRetry(e, attempt)) {
        console.error('Error is not retryable:', e);
        throw e;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );

      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, e.message);
      Utilities.sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Default function to determine if an error should trigger a retry
 * @param {Error} error - The error
 * @param {number} attempt - Current attempt number
 * @returns {boolean} Whether to retry
 */
function defaultShouldRetry(error, attempt) {
  const message = error.message || '';

  // Check for HTTP status codes in error message
  for (const code of RETRYABLE_STATUS_CODES) {
    if (message.includes(String(code))) {
      return true;
    }
  }

  // Check for common transient error patterns
  const retryablePatterns = [
    'timeout',
    'timed out',
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'service unavailable',
    'internal error',
    'server error',
    'network error',
    'connection reset',
    'ECONNRESET',
    'ETIMEDOUT'
  ];

  const lowerMessage = message.toLowerCase();
  return retryablePatterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Make an HTTP request with automatic retry
 * @param {string} url - Request URL
 * @param {Object} options - UrlFetchApp options
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse} The response
 */
function fetchWithRetry(url, options = {}) {
  return withRetry(() => {
    const response = UrlFetchApp.fetch(url, {
      ...options,
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();

    // Throw error for retryable status codes
    if (RETRYABLE_STATUS_CODES.includes(code)) {
      throw new Error(`HTTP ${code}: ${response.getContentText().substring(0, 200)}`);
    }

    // For other error codes, don't retry but still throw
    if (code >= 400) {
      const error = new Error(`HTTP ${code}: ${response.getContentText().substring(0, 500)}`);
      error.statusCode = code;
      error.isRetryable = false;
      throw error;
    }

    return response;
  }, {
    shouldRetry: (error, attempt) => {
      // Don't retry non-retryable errors
      if (error.isRetryable === false) {
        return false;
      }
      return defaultShouldRetry(error, attempt);
    }
  });
}

/**
 * Execute a batch operation with retry on individual items
 * @param {Array} items - Items to process
 * @param {function} processFn - Function to process each item
 * @param {Object} options - Options
 * @param {number} [options.maxRetries] - Max retries per item
 * @param {boolean} [options.continueOnError] - Continue processing on error
 * @returns {Object} Results with successes and failures
 */
function batchWithRetry(items, processFn, options = {}) {
  const maxRetries = options.maxRetries || 2;
  const continueOnError = options.continueOnError !== false;

  const results = {
    successes: [],
    failures: []
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const result = withRetry(() => processFn(item, i), { maxRetries });
      results.successes.push({ item, result, index: i });
    } catch (e) {
      console.error(`Failed to process item ${i}:`, e);
      results.failures.push({ item, error: e.message, index: i });

      if (!continueOnError) {
        break;
      }
    }
  }

  return results;
}

/**
 * Wrap TikTok API calls with retry logic
 * @param {Object} params - API parameters
 * @returns {Object} API response
 */
function queryTikTokResearchAPIWithRetry(params) {
  return withRetry(() => queryTikTokResearchAPI(params), {
    maxRetries: 3,
    shouldRetry: (error, attempt) => {
      // TikTok specific retry logic
      const message = error.message || '';

      // Don't retry invalid token errors
      if (message.includes('invalid_token') || message.includes('access_token')) {
        // Try to refresh token once
        if (attempt === 0) {
          console.log('Attempting to refresh TikTok token');
          invalidateTikTokResearchToken();
          return true;
        }
        return false;
      }

      return defaultShouldRetry(error, attempt);
    }
  });
}

/**
 * Wrap Instagram API calls with retry logic
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
function callInstagramAPIWithRetry(endpoint, params) {
  return withRetry(() => callInstagramAPI(endpoint, params), {
    maxRetries: 3,
    shouldRetry: (error, attempt) => {
      const message = error.message || '';

      // Don't retry auth errors
      if (message.includes('OAuthException') || message.includes('access token')) {
        return false;
      }

      // Handle Instagram rate limits
      if (message.includes('rate limit') || message.includes('4201')) {
        // Wait longer for rate limits
        Utilities.sleep(5000);
        return true;
      }

      return defaultShouldRetry(error, attempt);
    }
  });
}

/**
 * Recover a failed run
 * Attempts to continue from where the run failed
 * @param {string} runId - The run ID
 * @returns {Object} Recovery result
 */
function recoverFailedRun(runId) {
  const state = loadRunState(runId);

  if (!state) {
    return { success: false, message: 'Run not found' };
  }

  if (state.status !== RUN_STATUS.FAILED) {
    return { success: false, message: 'Run is not in failed state' };
  }

  console.log(`Attempting to recover run ${runId}`);
  console.log(`Last status: ${state.status}`);
  console.log(`Instagram progress: ${state.instagramProgress.collected}/${state.instagramProgress.target}`);
  console.log(`TikTok progress: ${state.tiktokProgress.collected}/${state.tiktokProgress.target}`);

  // Determine recovery point
  let recoveryStatus;

  if (state.instagramProgress.collected < state.instagramProgress.target && isMetaAuthorized()) {
    recoveryStatus = RUN_STATUS.RUNNING_INSTAGRAM;
  } else if (state.tiktokProgress.collected < state.tiktokProgress.target) {
    recoveryStatus = RUN_STATUS.RUNNING_TIKTOK;
  } else {
    recoveryStatus = RUN_STATUS.FINALIZING;
  }

  // Clear error state
  const updatedState = loadRunState(runId);
  updatedState.lastError = null;
  updatedState.status = recoveryStatus;
  updatedState.lastMessage = 'Recovering...';
  saveRunState(updatedState);

  // Schedule continuation
  scheduleContinuation(runId);

  return {
    success: true,
    message: `Recovery started from ${recoveryStatus}`,
    runId: runId,
    spreadsheetUrl: state.spreadsheetUrl
  };
}

/**
 * Health check for all services
 * @returns {Object} Health status
 */
function healthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check Script Properties
  try {
    const props = PropertiesService.getScriptProperties();
    props.getProperty('test');
    results.services.scriptProperties = { status: 'ok' };
  } catch (e) {
    results.services.scriptProperties = { status: 'error', message: e.message };
  }

  // Check Drive access
  try {
    DriveApp.getRootFolder();
    results.services.drive = { status: 'ok' };
  } catch (e) {
    results.services.drive = { status: 'error', message: e.message };
  }

  // Check Spreadsheet access
  try {
    SpreadsheetApp.getActiveSpreadsheet; // Just check if available
    results.services.sheets = { status: 'ok' };
  } catch (e) {
    results.services.sheets = { status: 'error', message: e.message };
  }

  // Check TikTok Research API
  if (isTikTokResearchConfigured()) {
    try {
      const token = getTikTokResearchAccessToken();
      results.services.tiktokResearch = {
        status: token ? 'ok' : 'no_token',
        hasToken: !!token
      };
    } catch (e) {
      results.services.tiktokResearch = { status: 'error', message: e.message };
    }
  } else {
    results.services.tiktokResearch = { status: 'not_configured' };
  }

  // Check Instagram API
  if (isInstagramConfigured()) {
    try {
      const authorized = isMetaAuthorized();
      results.services.instagram = {
        status: authorized ? 'ok' : 'not_authorized',
        authorized: authorized
      };
    } catch (e) {
      results.services.instagram = { status: 'error', message: e.message };
    }
  } else {
    results.services.instagram = { status: 'not_configured' };
  }

  // Check OpenAI
  const openaiKey = getConfig(CONFIG_KEYS.OPENAI_API_KEY);
  results.services.openai = {
    status: openaiKey ? 'configured' : 'not_configured',
    hasKey: !!openaiKey
  };

  // Overall status
  const allOk = Object.values(results.services).every(
    s => s.status === 'ok' || s.status === 'configured' || s.status === 'not_configured'
  );
  results.overall = allOk ? 'healthy' : 'degraded';

  return results;
}
