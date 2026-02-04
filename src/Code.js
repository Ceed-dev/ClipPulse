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
 * Web App entry point - serves the HTML UI or handles API requests
 * Routes based on 'action' parameter:
 * - No action: Return HTML UI (existing behavior)
 * - action=start: API start endpoint
 * - action=status: API status endpoint
 *
 * @param {Object} e - Event object
 * @returns {GoogleAppsScript.HTML.HtmlOutput|GoogleAppsScript.Content.TextOutput} HTML or JSON response
 */
function doGet(e) {
  // Try API routing first
  const apiResponse = routeApiRequest(e);
  if (apiResponse) {
    return apiResponse;
  }

  // No action parameter = UI mode, return HTML
  return HtmlService.createHtmlOutputFromFile('UI')
    .setTitle('ClipPulse - Short-Video Trend Collector')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle POST requests for API
 * @param {Object} e - Event object
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function doPost(e) {
  // All POST requests go through API routing
  const apiResponse = routeApiRequest(e);
  if (apiResponse) {
    return apiResponse;
  }

  // If no action, return error
  return createJsonResponse(buildApiResponse(false, {}, {
    code: 'MISSING_ACTION',
    message: 'POST requests require an action parameter (e.g., ?action=start)'
  }));
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

  console.log('=== Script Properties ===');
  console.log(JSON.stringify(masked, null, 2));

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
// Debug & Status Check Functions
// ============================================================

/**
 * Check platform configuration status (for troubleshooting 0-data bug)
 * Run this function to see detailed platform status in the Execution log
 * @returns {Object} Platform configuration status
 */
function checkPlatformStatus() {
  console.log('=== Platform Configuration Status ===\n');

  // Check X (Twitter) configuration
  const xApiKey = getConfig(CONFIG_KEYS.X_API_KEY);
  const xConfigured = isXConfigured();
  console.log('X (Twitter):');
  console.log('  X_API_KEY set:', xApiKey ? 'YES (length: ' + xApiKey.length + ')' : 'NO');
  console.log('  isXConfigured():', xConfigured);

  // Check Instagram configuration
  const metaAppId = getConfig(CONFIG_KEYS.META_APP_ID);
  const metaAppSecret = getConfig(CONFIG_KEYS.META_APP_SECRET);
  const igUserId = getConfig(CONFIG_KEYS.IG_DEFAULT_IG_USER_ID);
  const igConfigured = isInstagramConfigured();
  const igAuthorized = isMetaAuthorized();
  console.log('\nInstagram:');
  console.log('  META_APP_ID set:', metaAppId ? 'YES' : 'NO');
  console.log('  META_APP_SECRET set:', metaAppSecret ? 'YES' : 'NO');
  console.log('  IG_DEFAULT_IG_USER_ID set:', igUserId || 'NO');
  console.log('  isInstagramConfigured():', igConfigured);
  console.log('  isMetaAuthorized():', igAuthorized);

  // Check mock mode
  const mockMode = isMockMode();
  console.log('\nMock Mode:');
  console.log('  isMockMode():', mockMode);
  console.log('  USE_MOCKS:', getConfig('USE_MOCKS') || 'not set');

  // Summary
  const hasAnyPlatform = xConfigured || igAuthorized || mockMode;
  console.log('\n=== Summary ===');
  console.log('At least one platform available:', hasAnyPlatform ? 'YES' : 'NO - WILL FAIL!');

  if (!hasAnyPlatform) {
    console.log('\nWARNING: No platforms are configured!');
    console.log('startRun() will throw an error.');
    console.log('\nTo fix:');
    console.log('1. For X (Twitter): Add X_API_KEY to Script Properties');
    console.log('2. For Instagram: Complete Meta OAuth flow (run logAuthUrls())');
    console.log('3. For testing: Set USE_MOCKS=true in Script Properties');
  }

  return {
    x: {
      configured: xConfigured,
      apiKeySet: !!xApiKey
    },
    instagram: {
      configured: igConfigured,
      authorized: igAuthorized,
      appIdSet: !!metaAppId,
      appSecretSet: !!metaAppSecret,
      userIdSet: !!igUserId
    },
    mockMode: mockMode,
    hasAnyPlatform: hasAnyPlatform
  };
}

/**
 * Check authentication status and Instagram connection
 * Run this function to see detailed status in the Execution log
 */
function checkStatus() {
  console.log('=== Auth Status ===');
  const authStatus = getAuthStatus();
  console.log(JSON.stringify(authStatus, null, 2));

  console.log('\n=== Instagram Test ===');
  const igTest = testInstagram();
  console.log(JSON.stringify(igTest, null, 2));

  console.log('\n=== Summary ===');
  console.log('Instagram configured:', authStatus.instagram.configured);
  console.log('Instagram authorized:', authStatus.instagram.authorized);
  console.log('Instagram User ID:', authStatus.instagram.userId || 'NOT SET');

  if (igTest.success) {
    console.log('Instagram username:', igTest.username);
    console.log('Status: READY TO USE');
  } else {
    console.log('Error:', igTest.message);
    console.log('Status: NEEDS SETUP');
  }

  return { authStatus, igTest };
}

// ============================================================
// Server functions exposed to the UI (called via google.script.run)
// These are referenced in UI.html
// ============================================================

// startRun(instruction) - defined in Orchestrator.js
// getRunStatus(runId) - defined in Orchestrator.js
// cancelRun(runId) - defined in Orchestrator.js

// ============================================================
// Debug Test Functions for Instagram API
// ============================================================

/**
 * Test hashtag search functionality
 * Run this to verify hashtag search is working
 */
function testHashtagSearch() {
  console.log('=== Testing Hashtag Search ===');

  const testHashtags = ['skincare', 'beauty', 'fashion'];

  for (const hashtag of testHashtags) {
    console.log(`\nSearching for hashtag: ${hashtag}`);
    try {
      const hashtagId = searchHashtagId(hashtag);
      if (hashtagId) {
        console.log(`✓ Found hashtag ID: ${hashtagId}`);

        // Try to get top media
        console.log('Attempting to get top media...');
        const topMedia = getHashtagTopMedia(hashtagId, 3);
        console.log(`✓ Got ${topMedia.media.length} top media items`);

        if (topMedia.media.length > 0) {
          console.log('First media item:', JSON.stringify(topMedia.media[0], null, 2));
        }

        return { success: true, hashtagId, mediaCount: topMedia.media.length };
      } else {
        console.log(`✗ Hashtag not found: ${hashtag}`);
      }
    } catch (e) {
      console.log(`✗ Error searching hashtag "${hashtag}": ${e.message}`);
      console.log('Full error:', e);
    }
  }

  return { success: false, message: 'No hashtags found' };
}

/**
 * Test getting own account media
 * This is the fallback when hashtag search fails
 */
function testOwnAccountMedia() {
  console.log('=== Testing Own Account Media ===');

  try {
    const result = getOwnAccountMedia(5);
    console.log(`Got ${result.media.length} media items from own account`);

    if (result.media.length > 0) {
      console.log('First media item:', JSON.stringify(result.media[0], null, 2));
    }

    return { success: true, mediaCount: result.media.length, media: result.media };
  } catch (e) {
    console.log('Error:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Test the full Web App flow to identify where the problem is
 */
function testWebAppFlow() {
  console.log('=== Testing Web App Flow ===');

  const instruction = 'Find 5 posts about skincare trends';
  console.log('Instruction:', instruction);

  // Step 1: Parse instruction to plan
  console.log('\n--- Step 1: Parse instruction to plan ---');
  let plan;
  try {
    plan = parseInstructionToPlan(instruction);
    console.log('Plan created:', JSON.stringify(plan, null, 2));
  } catch (e) {
    console.log('Error creating plan:', e.message);
    return { success: false, step: 1, error: e.message };
  }

  // Step 2: Check what hashtags will be searched
  console.log('\n--- Step 2: Check hashtags to search ---');
  const hashtagsToSearch = plan.queryStrategy?.instagram?.hashtagsToSearch ||
    plan.hashtags ||
    plan.keywords?.slice(0, 3) ||
    [];
  console.log('Hashtags to search:', hashtagsToSearch);

  if (hashtagsToSearch.length === 0) {
    console.log('ERROR: No hashtags to search!');
    return { success: false, step: 2, error: 'No hashtags' };
  }

  // Step 3: Try to search first hashtag
  console.log('\n--- Step 3: Search first hashtag ---');
  const firstHashtag = hashtagsToSearch[0];
  console.log('Searching for:', firstHashtag);

  try {
    const hashtagId = searchHashtagId(firstHashtag);
    console.log('Hashtag ID:', hashtagId);

    if (!hashtagId) {
      console.log('ERROR: Hashtag not found');
      return { success: false, step: 3, error: 'Hashtag not found' };
    }

    // Step 4: Get top media
    console.log('\n--- Step 4: Get top media ---');
    const topMedia = getHashtagTopMedia(hashtagId, 5);
    console.log('Got', topMedia.media.length, 'media items');

    if (topMedia.media.length > 0) {
      console.log('First media:', JSON.stringify(topMedia.media[0], null, 2));
    }

    return {
      success: true,
      plan: plan,
      hashtagsToSearch: hashtagsToSearch,
      mediaCount: topMedia.media.length
    };
  } catch (e) {
    console.log('Error:', e.message);
    return { success: false, step: 3, error: e.message };
  }
}

/**
 * Test the full collection process step by step
 * This helps identify where errors occur
 */
function testFullCollectionProcess() {
  console.log('=== Testing Full Collection Process ===');

  // Step 1: Get hashtag media
  console.log('\n--- Step 1: Get hashtag media ---');
  let media;
  try {
    const hashtagId = searchHashtagId('skincare');
    console.log('Hashtag ID:', hashtagId);

    const topMedia = getHashtagTopMedia(hashtagId, 3);
    console.log('Got media count:', topMedia.media.length);

    if (topMedia.media.length === 0) {
      console.log('No media found, stopping test');
      return { success: false, step: 1, message: 'No media found' };
    }

    media = topMedia.media[0];
    console.log('First media:', JSON.stringify(media, null, 2));
  } catch (e) {
    console.log('Step 1 Error:', e.message);
    return { success: false, step: 1, error: e.message };
  }

  // Step 2: Test normalization
  console.log('\n--- Step 2: Test normalization ---');
  try {
    const normalized = normalizeInstagramPost(media, '', 'test memo');
    console.log('Normalized post:', JSON.stringify(normalized, null, 2));
  } catch (e) {
    console.log('Step 2 Error:', e.message);
    console.log('Full error:', e);
    return { success: false, step: 2, error: e.message };
  }

  // Step 3: Test spreadsheet write (create temp spreadsheet)
  console.log('\n--- Step 3: Test spreadsheet write ---');
  try {
    const ss = SpreadsheetApp.create('Test_ClipPulse_' + Date.now());
    const sheet = ss.getActiveSheet();
    sheet.setName('Instagram');

    // Write header using getColumnsForPlatform
    const headers = getColumnsForPlatform('instagram');
    console.log('Headers count:', headers.length);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Write data using postDataToRow
    const normalized = normalizeInstagramPost(media, '', 'test');
    const row = postDataToRow(normalized, headers);
    console.log('Row data count:', row.length);
    sheet.getRange(2, 1, 1, row.length).setValues([row]);

    console.log('Spreadsheet created:', ss.getUrl());

    // Clean up - delete test spreadsheet
    DriveApp.getFileById(ss.getId()).setTrashed(true);
    console.log('Test spreadsheet deleted');

    return { success: true, message: 'All steps passed' };
  } catch (e) {
    console.log('Step 3 Error:', e.message);
    console.log('Full error:', e);
    return { success: false, step: 3, error: e.message };
  }
}

/**
 * Test the actual collection with minimal processing
 * This bypasses artifact creation to isolate the issue
 */
function testMinimalCollection() {
  console.log('=== Testing Minimal Collection ===');

  try {
    // Step 1: Get media
    console.log('Getting hashtag media...');
    const hashtagId = searchHashtagId('skincare');
    const topMedia = getHashtagTopMedia(hashtagId, 3);
    console.log('Got', topMedia.media.length, 'media items');

    if (topMedia.media.length === 0) {
      return { success: false, message: 'No media found' };
    }

    // Step 2: Create test spreadsheet
    console.log('Creating spreadsheet...');
    const result = createRunSpreadsheet('test_' + Date.now());
    console.log('Spreadsheet ID:', result.spreadsheetId);

    // Step 3: Write data directly using appendRowsBatch
    console.log('Writing data...');
    const normalizedPosts = topMedia.media.map(m => normalizeInstagramPost(m, '', 'test'));
    console.log('Normalized posts count:', normalizedPosts.length);

    const rowsWritten = appendRowsBatch(result.spreadsheetId, 'instagram', normalizedPosts);
    console.log('Rows written:', rowsWritten);

    console.log('Spreadsheet URL:', result.spreadsheetUrl);

    return {
      success: true,
      spreadsheetUrl: result.spreadsheetUrl,
      rowsWritten: rowsWritten
    };
  } catch (e) {
    console.log('Error:', e.message);
    console.log('Full error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Test hashtag collection with Drive artifact creation
 * This tests the full flow including Drive folders and watch.html creation
 */
function testHashtagCollectionWithArtifacts() {
  console.log('=== Testing Hashtag Collection with Drive Artifacts ===');

  try {
    // Step 1: Create a test run
    console.log('\n--- Step 1: Create test run ---');
    const runId = generateRunId();
    console.log('Run ID:', runId);

    // Create run state
    const state = createRunState(runId, 'Test hashtag collection with artifacts');
    saveRunState(state);

    // Create folder structure
    console.log('Creating folder structure...');
    const folders = createRunFolderStructure(runId);
    console.log('Instagram folder ID:', folders.instagramFolderId);

    // Create spreadsheet
    console.log('Creating spreadsheet...');
    const spreadsheet = createRunSpreadsheet(runId);
    console.log('Spreadsheet URL:', spreadsheet.spreadsheetUrl);

    // Save resources to state
    setRunResources(runId, {
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      runFolderId: folders.runFolderId,
      instagramFolderId: folders.instagramFolderId,
      tiktokFolderId: folders.tiktokFolderId
    });

    // Step 2: Search hashtag and get media
    console.log('\n--- Step 2: Search hashtag ---');
    const hashtagId = searchHashtagId('skincare');
    console.log('Hashtag ID:', hashtagId);

    const topMedia = getHashtagTopMedia(hashtagId, 3);
    console.log('Got', topMedia.media.length, 'media items');

    if (topMedia.media.length === 0) {
      return { success: false, message: 'No media found' };
    }

    // Step 3: Process each media with artifact creation
    console.log('\n--- Step 3: Process media with artifacts ---');
    const reloadedState = loadRunState(runId);
    const postsToWrite = [];

    for (const media of topMedia.media) {
      console.log('Processing media:', media.id);
      const result = processHashtagMedia(runId, reloadedState, media, 'skincare');
      if (result.processed) {
        postsToWrite.push(result.normalizedPost);
        console.log('  - ref_url:', result.normalizedPost.ref_url);
        console.log('  - memo:', result.normalizedPost.memo);
      }
    }

    // Step 4: Write to spreadsheet
    console.log('\n--- Step 4: Write to spreadsheet ---');
    const rowsWritten = appendRowsBatch(spreadsheet.spreadsheetId, 'instagram', postsToWrite);
    console.log('Rows written:', rowsWritten);

    // Step 5: Verify columns
    console.log('\n--- Step 5: Verify column data ---');
    const sheet = SpreadsheetApp.openById(spreadsheet.spreadsheetId).getSheetByName('Instagram');
    const headers = sheet.getRange(1, 1, 1, 23).getValues()[0];
    const firstRow = sheet.getRange(2, 1, 1, 23).getValues()[0];

    console.log('Column verification:');
    headers.forEach((header, i) => {
      const value = firstRow[i];
      const status = value !== '' && value !== null ? '✓' : '✗ (empty)';
      console.log(`  ${header}: ${status}`);
    });

    console.log('\n=== Test Complete ===');
    console.log('Spreadsheet URL:', spreadsheet.spreadsheetUrl);
    console.log('Instagram folder:', `https://drive.google.com/drive/folders/${folders.instagramFolderId}`);

    return {
      success: true,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      instagramFolderUrl: `https://drive.google.com/drive/folders/${folders.instagramFolderId}`,
      rowsWritten: rowsWritten
    };

  } catch (e) {
    console.log('Error:', e.message);
    console.log('Full error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Test hashtag API fields - check what fields are actually returned
 * This helps understand API limitations
 */
function testHashtagApiFields() {
  console.log('=== Testing Hashtag API Field Availability ===');

  try {
    // Search for hashtag
    console.log('\n--- Searching hashtag: skincare ---');
    const hashtagId = searchHashtagId('skincare');
    console.log('Hashtag ID:', hashtagId);

    // Get top media
    console.log('\n--- Getting top media ---');
    const topMedia = getHashtagTopMedia(hashtagId, 3);
    console.log('Got', topMedia.media.length, 'media items');

    if (topMedia.media.length === 0) {
      return { success: false, message: 'No media found' };
    }

    // Check each media item for available fields
    console.log('\n--- Checking available fields ---');
    topMedia.media.forEach((media, index) => {
      console.log(`\nMedia ${index + 1} (ID: ${media.id}):`);
      console.log('  id:', media.id ? '✓' : '✗');
      console.log('  caption:', media.caption ? '✓ (length: ' + media.caption.length + ')' : '✗');
      console.log('  media_type:', media.media_type || '✗');
      console.log('  media_url:', media.media_url ? '✓ URL available' : '✗ NOT available');
      console.log('  thumbnail_url:', media.thumbnail_url ? '✓ URL available' : '✗ NOT available');
      console.log('  permalink:', media.permalink ? '✓' : '✗');
      console.log('  timestamp:', media.timestamp ? '✓' : '✗');
      console.log('  like_count:', media.like_count !== undefined ? '✓ (' + media.like_count + ')' : '✗');
      console.log('  comments_count:', media.comments_count !== undefined ? '✓ (' + media.comments_count + ')' : '✗');

      if (media.media_url) {
        console.log('  media_url preview:', media.media_url.substring(0, 100) + '...');
      }
    });

    // Find a VIDEO type and try to download
    const videoMedia = topMedia.media.find(m => m.media_type === 'VIDEO');
    if (videoMedia && videoMedia.media_url) {
      console.log('\n--- Found VIDEO with media_url, testing download ---');

      const root = getRootFolder();
      const testFolder = root.createFolder('test_hashtag_download_' + Date.now());

      console.log('Downloading video...');
      const file = saveVideoFile(testFolder, videoMedia.media_url, 'video.mp4');

      if (file) {
        console.log('SUCCESS! Video downloaded');
        console.log('File URL:', file.getUrl());
        console.log('File size:', file.getSize(), 'bytes');
        return {
          success: true,
          message: 'Video download successful!',
          fileUrl: file.getUrl(),
          testFolderUrl: testFolder.getUrl()
        };
      } else {
        console.log('FAILED: Video download failed');
        testFolder.setTrashed(true);
      }
    } else {
      console.log('\n--- No VIDEO with media_url found ---');
    }

    return {
      success: true,
      message: 'API fields checked - see log for details',
      mediaCount: topMedia.media.length
    };

  } catch (e) {
    console.log('Error:', e.message);
    console.log('Full error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Test own account media collection with video download
 * This tests if video.mp4 can be downloaded from own account media
 */
function testOwnAccountWithVideoDownload() {
  console.log('=== Testing Own Account Media with Video Download ===');

  try {
    // Step 1: Get own account media
    console.log('\n--- Step 1: Get own account media ---');
    const mediaResult = getOwnAccountMedia(5);
    console.log('Got', mediaResult.media.length, 'media items');

    if (mediaResult.media.length === 0) {
      console.log('No media found in own account');
      return { success: false, message: 'No media in own account' };
    }

    // Step 2: Check what fields are available
    console.log('\n--- Step 2: Check available fields ---');
    const firstMedia = mediaResult.media[0];
    console.log('First media fields:');
    console.log('  id:', firstMedia.id);
    console.log('  media_type:', firstMedia.media_type);
    console.log('  media_url:', firstMedia.media_url ? 'YES' : 'NO');
    console.log('  thumbnail_url:', firstMedia.thumbnail_url ? 'YES' : 'NO');
    console.log('  media_product_type:', firstMedia.media_product_type || 'N/A');

    // Find a VIDEO type media
    const videoMedia = mediaResult.media.find(m => m.media_type === 'VIDEO');
    if (videoMedia) {
      console.log('\n--- Found VIDEO media ---');
      console.log('  id:', videoMedia.id);
      console.log('  media_url:', videoMedia.media_url ? videoMedia.media_url.substring(0, 80) + '...' : 'NO');
    } else {
      console.log('\nNo VIDEO type media found in first 5 items');
    }

    // Step 3: Create test folder and try to download
    console.log('\n--- Step 3: Test video download ---');
    const root = getRootFolder();
    const testFolder = root.createFolder('test_video_download_' + Date.now());

    // Try to download from the first video or any media with media_url
    const mediaToDownload = videoMedia || mediaResult.media.find(m => m.media_url);

    if (!mediaToDownload) {
      console.log('No media with media_url found');
      testFolder.setTrashed(true);
      return { success: false, message: 'No media_url available' };
    }

    console.log('Attempting to download media:', mediaToDownload.id);
    console.log('Media type:', mediaToDownload.media_type);
    console.log('Media URL available:', !!mediaToDownload.media_url);

    if (mediaToDownload.media_url) {
      console.log('Downloading...');
      const filename = mediaToDownload.media_type === 'VIDEO' ? 'video.mp4' : 'image.jpg';
      const file = saveVideoFile(testFolder, mediaToDownload.media_url, filename);

      if (file) {
        console.log('SUCCESS! File downloaded:', file.getName());
        console.log('File URL:', file.getUrl());
        console.log('File size:', file.getSize(), 'bytes');

        return {
          success: true,
          message: 'Video/image downloaded successfully',
          fileUrl: file.getUrl(),
          testFolderUrl: testFolder.getUrl()
        };
      } else {
        console.log('FAILED: Could not download file');
        testFolder.setTrashed(true);
        return { success: false, message: 'Download failed' };
      }
    }

    testFolder.setTrashed(true);
    return { success: false, message: 'No downloadable media found' };

  } catch (e) {
    console.log('Error:', e.message);
    console.log('Full error:', e);
    return { success: false, error: e.message };
  }
}

// ============================================================
// E2E Column Completeness Test Functions
// ============================================================

/**
 * Instagram全カラムの取得テスト
 * 最新の取得データで各カラムの充足率を確認
 * @param {string} [spreadsheetId] - Optional spreadsheet ID. If not provided, uses most recent run.
 * @param {number} [rowCount=50] - Number of rows to analyze
 * @returns {Object} Analysis result with column fill rates
 */
function testInstagramColumnCompleteness(spreadsheetId, rowCount = 50) {
  console.log('=== Instagram Column Completeness Test ===\n');

  try {
    // Get spreadsheet
    let ss;
    if (spreadsheetId) {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } else {
      // Find most recent ClipPulse spreadsheet
      const files = DriveApp.searchFiles('title contains "ClipPulse_" and mimeType = "application/vnd.google-apps.spreadsheet"');
      if (!files.hasNext()) {
        console.log('ERROR: No ClipPulse spreadsheet found');
        return { success: false, error: 'No spreadsheet found' };
      }
      // Get the most recent one
      let mostRecent = files.next();
      while (files.hasNext()) {
        const file = files.next();
        if (file.getDateCreated() > mostRecent.getDateCreated()) {
          mostRecent = file;
        }
      }
      ss = SpreadsheetApp.openById(mostRecent.getId());
      console.log('Using spreadsheet:', mostRecent.getName());
    }

    const sheet = ss.getSheetByName('Instagram');
    if (!sheet) {
      console.log('ERROR: Instagram sheet not found');
      return { success: false, error: 'Instagram sheet not found' };
    }

    // Get data
    const lastRow = sheet.getLastRow();
    const dataRows = Math.min(rowCount, lastRow - 1);
    if (dataRows <= 0) {
      console.log('No data rows found');
      return { success: false, error: 'No data rows' };
    }

    console.log(`Analyzing ${dataRows} rows...\n`);

    const headers = sheet.getRange(1, 1, 1, INSTAGRAM_COLUMNS.length).getValues()[0];
    const data = sheet.getRange(2, 1, dataRows, INSTAGRAM_COLUMNS.length).getValues();

    // Calculate fill rate for each column
    const results = {};
    const warnings = [];

    headers.forEach((header, colIndex) => {
      let filledCount = 0;
      data.forEach(row => {
        const value = row[colIndex];
        if (value !== '' && value !== null && value !== undefined) {
          filledCount++;
        }
      });

      const fillRate = (filledCount / dataRows * 100).toFixed(1);
      results[header] = {
        filled: filledCount,
        total: dataRows,
        rate: parseFloat(fillRate)
      };

      // Log result
      const status = fillRate >= 80 ? '✓' : (fillRate >= 50 ? '△' : '✗');
      console.log(`${status} ${header}: ${fillRate}% (${filledCount}/${dataRows})`);

      // Track warnings for low fill rate
      if (parseFloat(fillRate) < 50) {
        warnings.push({ column: header, rate: parseFloat(fillRate) });
      }
    });

    // Summary
    console.log('\n--- Summary ---');
    if (warnings.length > 0) {
      console.log('⚠️ Low fill rate columns (<50%):');
      warnings.forEach(w => console.log(`  - ${w.column}: ${w.rate}%`));
    } else {
      console.log('✓ All columns have acceptable fill rates');
    }

    return {
      success: true,
      platform: 'instagram',
      rowsAnalyzed: dataRows,
      columns: results,
      warnings: warnings
    };

  } catch (e) {
    console.log('Error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * X全カラムの取得テスト
 * 最新の取得データで各カラムの充足率を確認
 * @param {string} [spreadsheetId] - Optional spreadsheet ID. If not provided, uses most recent run.
 * @param {number} [rowCount=50] - Number of rows to analyze
 * @returns {Object} Analysis result with column fill rates
 */
function testXColumnCompleteness(spreadsheetId, rowCount = 50) {
  console.log('=== X Column Completeness Test ===\n');

  try {
    // Get spreadsheet
    let ss;
    if (spreadsheetId) {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } else {
      // Find most recent ClipPulse spreadsheet
      const files = DriveApp.searchFiles('title contains "ClipPulse_" and mimeType = "application/vnd.google-apps.spreadsheet"');
      if (!files.hasNext()) {
        console.log('ERROR: No ClipPulse spreadsheet found');
        return { success: false, error: 'No spreadsheet found' };
      }
      // Get the most recent one
      let mostRecent = files.next();
      while (files.hasNext()) {
        const file = files.next();
        if (file.getDateCreated() > mostRecent.getDateCreated()) {
          mostRecent = file;
        }
      }
      ss = SpreadsheetApp.openById(mostRecent.getId());
      console.log('Using spreadsheet:', mostRecent.getName());
    }

    const sheet = ss.getSheetByName('X');
    if (!sheet) {
      console.log('ERROR: X sheet not found');
      return { success: false, error: 'X sheet not found' };
    }

    // Get data
    const lastRow = sheet.getLastRow();
    const dataRows = Math.min(rowCount, lastRow - 1);
    if (dataRows <= 0) {
      console.log('No data rows found');
      return { success: false, error: 'No data rows' };
    }

    console.log(`Analyzing ${dataRows} rows...\n`);

    const headers = sheet.getRange(1, 1, 1, X_COLUMNS.length).getValues()[0];
    const data = sheet.getRange(2, 1, dataRows, X_COLUMNS.length).getValues();

    // Calculate fill rate for each column
    const results = {};
    const warnings = [];

    headers.forEach((header, colIndex) => {
      let filledCount = 0;
      data.forEach(row => {
        const value = row[colIndex];
        if (value !== '' && value !== null && value !== undefined) {
          filledCount++;
        }
      });

      const fillRate = (filledCount / dataRows * 100).toFixed(1);
      results[header] = {
        filled: filledCount,
        total: dataRows,
        rate: parseFloat(fillRate)
      };

      // Log result
      const status = fillRate >= 80 ? '✓' : (fillRate >= 50 ? '△' : '✗');
      console.log(`${status} ${header}: ${fillRate}% (${filledCount}/${dataRows})`);

      // Track warnings for low fill rate
      if (parseFloat(fillRate) < 50) {
        warnings.push({ column: header, rate: parseFloat(fillRate) });
      }
    });

    // Summary
    console.log('\n--- Summary ---');
    if (warnings.length > 0) {
      console.log('⚠️ Low fill rate columns (<50%):');
      warnings.forEach(w => console.log(`  - ${w.column}: ${w.rate}%`));
    } else {
      console.log('✓ All columns have acceptable fill rates');
    }

    return {
      success: true,
      platform: 'x',
      rowsAnalyzed: dataRows,
      columns: results,
      warnings: warnings
    };

  } catch (e) {
    console.log('Error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 欠損カラムを分析してログ出力
 * Instagram/X両方を分析
 * @param {string} [spreadsheetId] - Optional spreadsheet ID
 * @param {number} [rowCount=50] - Number of rows to analyze
 * @returns {Object} Combined analysis result
 */
function analyzeColumnGaps(spreadsheetId, rowCount = 50) {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        Column Gap Analysis - All Platforms             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const instagramResult = testInstagramColumnCompleteness(spreadsheetId, rowCount);

  console.log('\n' + '═'.repeat(60) + '\n');

  const xResult = testXColumnCompleteness(spreadsheetId, rowCount);

  // Combined summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    COMBINED SUMMARY');
  console.log('═'.repeat(60) + '\n');

  const allWarnings = [];

  if (instagramResult.success && instagramResult.warnings.length > 0) {
    console.log('Instagram issues:');
    instagramResult.warnings.forEach(w => {
      console.log(`  ⚠️ ${w.column}: ${w.rate}%`);
      allWarnings.push({ platform: 'instagram', ...w });
    });
  }

  if (xResult.success && xResult.warnings.length > 0) {
    console.log('X issues:');
    xResult.warnings.forEach(w => {
      console.log(`  ⚠️ ${w.column}: ${w.rate}%`);
      allWarnings.push({ platform: 'x', ...w });
    });
  }

  if (allWarnings.length === 0) {
    console.log('✓ No critical column gaps detected');
  } else {
    console.log(`\n⚠️ Total issues found: ${allWarnings.length}`);
  }

  return {
    success: instagramResult.success || xResult.success,
    instagram: instagramResult,
    x: xResult,
    totalWarnings: allWarnings.length,
    allWarnings: allWarnings
  };
}

/**
 * Check if RapidAPI key is configured for Instagram video download
 * Run this in Apps Script editor to verify setup
 */
function checkRapidAPIKey() {
  const key = PropertiesService.getScriptProperties().getProperty('INSTAGRAM_RAPIDAPI_KEY');
  const exists = !!key;
  const masked = exists ? key.substring(0, 8) + '...' + key.substring(key.length - 4) : 'NOT SET';

  console.log('=== RapidAPI Configuration Check ===');
  console.log('INSTAGRAM_RAPIDAPI_KEY exists:', exists ? 'YES ✓' : 'NO ✗');
  console.log('Key (masked):', masked);

  if (!exists) {
    console.log('\nTo enable Instagram video download:');
    console.log('1. Get API key from https://rapidapi.com/arraybobo/api/instagram-scraper-api2');
    console.log('2. In Apps Script: File > Project settings > Script properties');
    console.log('3. Add property: INSTAGRAM_RAPIDAPI_KEY = your_api_key');
  }

  return { exists, masked };
}
