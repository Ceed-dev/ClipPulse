/**
 * ApiHandler.js
 * Handles API requests for n8n integration
 *
 * Provides HTTP API endpoints alongside the existing HTML UI.
 * All API responses are JSON formatted.
 *
 * Endpoints:
 * - POST /exec?action=start - Start a new collection run
 * - GET /exec?action=status&run_id=xxx - Get run status
 */

const API_VERSION = 'v1';

/**
 * Validate API secret from request
 * @param {Object} e - Event object from doGet/doPost
 * @returns {boolean} True if secret is valid or not required (UI mode)
 */
function validateApiSecret(e) {
  const secret = getConfig(CONFIG_KEYS.CLIPPULSE_API_SECRET);

  // If no secret is configured, allow all requests (not recommended for production)
  if (!secret) {
    console.log('[API] Warning: No API secret configured. Consider setting CLIPPULSE_API_SECRET.');
    return true;
  }

  // Check header first (preferred method)
  // Note: Apps Script doGet/doPost doesn't expose headers directly,
  // so we use query parameter as fallback
  const providedSecret = e.parameter?.secret || null;

  if (!providedSecret) {
    console.log('[API] No secret provided in request');
    return false;
  }

  if (providedSecret !== secret) {
    console.log('[API] Invalid secret provided');
    return false;
  }

  return true;
}

/**
 * Build a standardized API response
 * @param {boolean} ok - Success status
 * @param {Object} data - Response data
 * @param {Object} [error] - Error object (if any)
 * @returns {Object} Standardized API response
 */
function buildApiResponse(ok, data = {}, error = null) {
  const response = {
    ok: ok,
    api_version: API_VERSION,
    ...data
  };

  if (error) {
    response.error = error;
  }

  return response;
}

/**
 * Create JSON response output
 * @param {Object} data - Response data
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle API start request
 * @param {Object} e - Event object from doGet/doPost
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function handleApiStart(e) {
  console.log('[API] handleApiStart called');

  // Validate secret
  if (!validateApiSecret(e)) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing API secret'
    }));
  }

  // Parse request body for POST, or use parameters for GET
  let params = {};

  if (e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse(buildApiResponse(false, {}, {
        code: 'INVALID_JSON',
        message: 'Failed to parse request body as JSON'
      }));
    }
  } else {
    // Fallback to query parameters
    params = e.parameter || {};
  }

  // Validate required parameters
  const instruction = params.instruction;
  const externalRunId = params.external_run_id;
  const targetFolderId = params.target_folder_id;
  const dryRun = params.dry_run === true || params.dry_run === 'true';
  const debug = params.debug === true || params.debug === 'true';

  if (!instruction) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'MISSING_PARAMETER',
      message: 'Required parameter "instruction" is missing'
    }));
  }

  if (!externalRunId) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'MISSING_PARAMETER',
      message: 'Required parameter "external_run_id" is missing'
    }));
  }

  if (!targetFolderId) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'MISSING_PARAMETER',
      message: 'Required parameter "target_folder_id" is missing'
    }));
  }

  if (debug) {
    console.log('[API] Debug mode enabled');
    console.log('[API] Params:', JSON.stringify(params));
  }

  try {
    // Start the run using shared business logic
    const result = startRun(instruction, {
      externalRunId: externalRunId,
      targetFolderId: targetFolderId,
      source: 'api'
    });

    // Return success response
    return createJsonResponse(buildApiResponse(true, {
      run_id: externalRunId,
      internal_run_id: result.runId,
      status: mapToApiStatus(result.status),
      spreadsheet_id: result.spreadsheetId,
      spreadsheet_url: result.spreadsheetUrl,
      created_folder_id: result.runFolderId,
      message: 'Run started successfully'
    }));

  } catch (error) {
    console.error('[API] Error starting run:', error);
    return createJsonResponse(buildApiResponse(false, {
      run_id: externalRunId
    }, {
      code: 'START_FAILED',
      message: error.message,
      details: debug ? error.stack : undefined
    }));
  }
}

/**
 * Handle API status request
 * @param {Object} e - Event object from doGet/doPost
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function handleApiStatus(e) {
  console.log('[API] handleApiStatus called');

  // Validate secret
  if (!validateApiSecret(e)) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing API secret'
    }));
  }

  const runId = e.parameter?.run_id;

  if (!runId) {
    return createJsonResponse(buildApiResponse(false, {}, {
      code: 'MISSING_PARAMETER',
      message: 'Required parameter "run_id" is missing'
    }));
  }

  // Get run status
  const statusSummary = getApiStatusSummary(runId);

  if (!statusSummary) {
    return createJsonResponse(buildApiResponse(false, {
      run_id: runId
    }, {
      code: 'NOT_FOUND',
      message: `Run not found: ${runId}`
    }));
  }

  // Return status response
  return createJsonResponse(buildApiResponse(true, statusSummary));
}

/**
 * Handle unknown API action
 * @param {string} action - The requested action
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function handleApiUnknown(action) {
  return createJsonResponse(buildApiResponse(false, {}, {
    code: 'UNKNOWN_ACTION',
    message: `Unknown action: ${action}. Valid actions: start, status`
  }));
}

/**
 * Route API request to appropriate handler
 * @param {Object} e - Event object from doGet/doPost
 * @returns {GoogleAppsScript.Content.TextOutput} Response (HTML or JSON)
 */
function routeApiRequest(e) {
  const action = e.parameter?.action;

  if (!action) {
    // No action = UI mode, return HTML
    return null;
  }

  switch (action.toLowerCase()) {
    case 'start':
      return handleApiStart(e);
    case 'status':
      return handleApiStatus(e);
    default:
      return handleApiUnknown(action);
  }
}
