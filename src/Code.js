/**
 * Code.js
 * Main entry point for ClipPulse Web App
 *
 * This file contains:
 * - Web App entry points (doGet)
 * - Server-side functions exposed to the UI
 * - Setup and utility functions
 */

/**
 * Web App entry point - serves the HTML UI
 * @param {Object} e - Event object
 * @returns {GoogleAppsScript.HTML.HtmlOutput} The HTML page
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('UI')
    .setTitle('ClipPulse - Short-Video Trend Collector')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Initialize the application
 * Call this once after setting up Script Properties
 */
function initialize() {
  console.log('Initializing ClipPulse...');

  // Initialize default configuration values
  initializeDefaults();

  // Validate configuration
  const validation = validateConfig();
  if (!validation.isValid) {
    console.log('Missing configuration keys:', validation.missingKeys);
    console.log('Please set these in Script Properties before using the app.');
  } else {
    console.log('Configuration validated successfully');
  }

  // Create root folder if needed
  try {
    const rootFolder = getRootFolder();
    console.log('Root folder ready:', rootFolder.getName());
  } catch (e) {
    console.error('Error creating root folder:', e);
  }

  console.log('Initialization complete');
  return 'Initialization complete';
}

/**
 * Get the current configuration status
 * @returns {Object} Configuration status
 */
function getConfigStatus() {
  const validation = validateConfig();
  const authStatus = getAuthStatus();

  return {
    isValid: validation.isValid,
    missingKeys: validation.missingKeys,
    auth: authStatus,
    operationalConfig: getOperationalConfig()
  };
}

/**
 * Setup function to display OAuth URLs
 * Run this from the script editor to get authorization URLs
 */
function setupAuth() {
  console.log('\n=== ClipPulse Auth Setup ===\n');

  // Check configuration
  const status = getConfigStatus();
  console.log('Configuration valid:', status.isValid);

  if (!status.isValid) {
    console.log('\nMissing configuration keys:');
    status.missingKeys.forEach(key => console.log('  - ' + key));
    console.log('\nPlease set these in File > Project Properties > Script Properties');
    return;
  }

  console.log('\nAuth Status:');
  console.log('  TikTok Research API configured:', status.auth.tiktokResearch.configured);
  console.log('  TikTok Display API configured:', status.auth.tiktokDisplay.configured);
  console.log('  Instagram configured:', status.auth.instagram.configured);
  console.log('  Instagram authorized:', status.auth.instagram.authorized);

  // Log OAuth URLs
  logAuthUrls();
}

/**
 * Test the TikTok Research API connection
 * @returns {Object} Test result
 */
function testTikTokResearch() {
  try {
    const token = getTikTokResearchAccessToken();
    if (!token) {
      return { success: false, message: 'Could not get access token' };
    }

    return {
      success: true,
      message: 'TikTok Research API connection successful',
      tokenPreview: token.substring(0, 20) + '...'
    };

  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Test the Instagram API connection
 * @returns {Object} Test result
 */
function testInstagram() {
  try {
    const token = getMetaAccessToken();
    if (!token) {
      return { success: false, message: 'Not authorized. Please complete OAuth flow.' };
    }

    const igUserId = getInstagramUserId();
    if (!igUserId) {
      return { success: false, message: 'Instagram User ID not set. Please run resolveInstagramUserId()' };
    }

    // Try to make a simple API call
    const response = UrlFetchApp.fetch(
      `https://graph.facebook.com/v18.0/${igUserId}?fields=username&access_token=${token}`,
      { muteHttpExceptions: true }
    );

    const data = JSON.parse(response.getContentText());

    if (data.error) {
      return { success: false, message: data.error.message };
    }

    return {
      success: true,
      message: 'Instagram API connection successful',
      username: data.username,
      userId: igUserId
    };

  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Run a test collection with mock data
 * @returns {Object} Test result
 */
function testMockRun() {
  // This uses the mock mode if enabled
  const instruction = 'TEST: Collect 5 posts about testing';

  try {
    const result = startRun(instruction);
    return {
      success: true,
      runId: result.runId,
      spreadsheetUrl: result.spreadsheetUrl
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Clean up old runs and triggers
 * @param {number} keepCount - Number of recent runs to keep
 * @returns {Object} Cleanup result
 */
function cleanup(keepCount = 50) {
  // Clean up old run states
  const deletedRuns = cleanupOldRunStates(keepCount);

  // Clean up any orphaned triggers
  cleanupTriggers();

  return {
    success: true,
    deletedRuns: deletedRuns,
    message: `Cleaned up ${deletedRuns} old runs`
  };
}

/**
 * Get a list of all runs for debugging
 * @returns {Object[]} Array of run summaries
 */
function debugListRuns() {
  return listRuns(50);
}

/**
 * Delete a specific run's state (for debugging)
 * @param {string} runId - The run ID to delete
 * @returns {Object} Result
 */
function debugDeleteRun(runId) {
  deleteRunState(runId);
  return { success: true, message: `Deleted run state for ${runId}` };
}

/**
 * Set a Script Property (for initial setup)
 * @param {string} key - Property key
 * @param {string} value - Property value
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  console.log(`Set ${key}`);
}

/**
 * Get all Script Properties (for debugging)
 * WARNING: This will show sensitive keys in logs
 * @returns {Object} All properties
 */
function debugGetAllProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  // Mask sensitive values
  const masked = {};
  for (const key in props) {
    if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
      masked[key] = props[key] ? '***SET***' : '***NOT SET***';
    } else {
      masked[key] = props[key];
    }
  }
  return masked;
}

/**
 * Quick setup helper - set multiple properties at once
 * @param {Object} properties - Key-value pairs to set
 */
function bulkSetProperties(properties) {
  const scriptProps = PropertiesService.getScriptProperties();
  for (const key in properties) {
    scriptProps.setProperty(key, properties[key]);
  }
  console.log('Set properties:', Object.keys(properties).join(', '));
}

// ============================================================
// Server functions exposed to the UI (called via google.script.run)
// These are referenced in UI.html
// ============================================================

// startRun(instruction) - defined in Orchestrator.js
// getRunStatus(runId) - defined in Orchestrator.js
// cancelRun(runId) - defined in Orchestrator.js
