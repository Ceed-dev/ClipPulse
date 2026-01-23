/**
 * SheetWriter.js
 * Creates and manages spreadsheet tabs and writes data rows
 *
 * Specification section 9 defines the spreadsheet output format:
 * - One spreadsheet per run with two tabs: Instagram and TikTok
 * - Fixed column schemas for each tab
 * - Batch row appending (never per-cell loops)
 */

/**
 * TikTok tab columns as defined in specification section 9.3
 * Order must match exactly
 */
const TIKTOK_COLUMNS = [
  'platform_post_id',
  'create_username',
  'posted_at',
  'caption_or_description',
  'region_code',
  'music_id',
  'hashtag_names',
  'effect_ids',
  'favorites_count',
  'video_duration',
  'is_stem_verified',
  'voice_to_text',
  'view',
  'like',
  'comments',
  'share_count',
  'playlist_id',
  'hashtag_info_list',
  'sticker_info_list',
  'effect_info_list',
  'video_mention_list',
  'video_label',
  'video_tag',
  'drive_url',
  'memo'
];

/**
 * Instagram tab columns as defined in specification section 9.4
 * Order must match exactly
 */
const INSTAGRAM_COLUMNS = [
  'platform_post_id',
  'create_username',
  'posted_at',
  'caption_or_description',
  'post_url',
  'like_count',
  'comments_count',
  'media_type',
  'media_url',
  'thumbnail_url',
  'shortcode',
  'media_product_type',
  'is_comment_enabled',
  'is_shared_to_feed',
  'children',
  'edges_comments',
  'edges_insights',
  'edges_collaborators',
  'boost_ads_list',
  'boost_eligibility_info',
  'copyright_check_information_status',
  'drive_url',
  'memo'
];

/**
 * Create a new spreadsheet for a run with Instagram and TikTok tabs
 * @param {string} runId - The run ID for naming the spreadsheet
 * @returns {Object} Object containing spreadsheetId and spreadsheetUrl
 */
function createRunSpreadsheet(runId) {
  // Create the spreadsheet
  const spreadsheet = SpreadsheetApp.create(`ClipPulse_${runId}`);
  const spreadsheetId = spreadsheet.getId();

  // Get the default sheet and rename it to Instagram
  const defaultSheet = spreadsheet.getSheets()[0];
  defaultSheet.setName('Instagram');

  // Create TikTok sheet
  const tiktokSheet = spreadsheet.insertSheet('TikTok');

  // Add headers to both sheets
  writeHeaders(defaultSheet, INSTAGRAM_COLUMNS);
  writeHeaders(tiktokSheet, TIKTOK_COLUMNS);

  // Format header rows
  formatHeaderRow(defaultSheet, INSTAGRAM_COLUMNS.length);
  formatHeaderRow(tiktokSheet, TIKTOK_COLUMNS.length);

  return {
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

/**
 * Write headers to a sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet
 * @param {string[]} columns - Array of column names
 */
function writeHeaders(sheet, columns) {
  const headerRange = sheet.getRange(1, 1, 1, columns.length);
  headerRange.setValues([columns]);
}

/**
 * Format the header row with bold text and frozen row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet
 * @param {number} columnCount - Number of columns
 */
function formatHeaderRow(sheet, columnCount) {
  const headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f3f3f3');
  sheet.setFrozenRows(1);

  // Auto-resize columns for headers
  for (let i = 1; i <= columnCount; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Get the appropriate sheet for a platform
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} platform - 'instagram' or 'tiktok'
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The sheet
 */
function getSheetForPlatform(spreadsheetId, platform) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheetName = platform === 'instagram' ? 'Instagram' : 'TikTok';
  return spreadsheet.getSheetByName(sheetName);
}

/**
 * Get the columns for a platform
 * @param {string} platform - 'instagram' or 'tiktok'
 * @returns {string[]} Array of column names
 */
function getColumnsForPlatform(platform) {
  return platform === 'instagram' ? INSTAGRAM_COLUMNS : TIKTOK_COLUMNS;
}

/**
 * Convert a post data object to a row array matching column order
 * @param {Object} postData - The post data object
 * @param {string[]} columns - The column names in order
 * @returns {Array} Row array matching column order
 */
function postDataToRow(postData, columns) {
  return columns.map(col => {
    const value = postData[col];

    // Handle undefined/null
    if (value === undefined || value === null) {
      return '';
    }

    // Convert arrays and objects to JSON strings (spec section 9.5)
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return JSON.stringify(value);
    }

    // Convert booleans to strings for consistency
    if (typeof value === 'boolean') {
      return value.toString();
    }

    return value;
  });
}

/**
 * Append multiple rows to a sheet in a single batch operation
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} platform - 'instagram' or 'tiktok'
 * @param {Object[]} postsData - Array of post data objects
 * @returns {number} Number of rows appended
 */
function appendRowsBatch(spreadsheetId, platform, postsData) {
  if (!postsData || postsData.length === 0) {
    return 0;
  }

  const sheet = getSheetForPlatform(spreadsheetId, platform);
  const columns = getColumnsForPlatform(platform);

  // Convert all post data to rows
  const rows = postsData.map(post => postDataToRow(post, columns));

  // Get the next empty row
  const lastRow = sheet.getLastRow();
  const startRow = lastRow + 1;

  // Write all rows in a single batch operation
  const range = sheet.getRange(startRow, 1, rows.length, columns.length);
  range.setValues(rows);

  return rows.length;
}

/**
 * Append a single row to a sheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} platform - 'instagram' or 'tiktok'
 * @param {Object} postData - The post data object
 */
function appendRow(spreadsheetId, platform, postData) {
  appendRowsBatch(spreadsheetId, platform, [postData]);
}

/**
 * Get the current row count for a platform (excluding header)
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} platform - 'instagram' or 'tiktok'
 * @returns {number} Number of data rows
 */
function getRowCount(spreadsheetId, platform) {
  const sheet = getSheetForPlatform(spreadsheetId, platform);
  const lastRow = sheet.getLastRow();
  return Math.max(0, lastRow - 1); // Subtract header row
}

/**
 * Normalize TikTok API response to match column schema
 * Handles field name differences as noted in spec section 9.3
 * @param {Object} apiResponse - Raw TikTok API response for a video
 * @param {string} driveUrl - The Drive URL for the artifact
 * @param {string} memo - Any memo notes
 * @returns {Object} Normalized post data matching column schema
 */
function normalizeTikTokPost(apiResponse, driveUrl, memo = '') {
  return {
    platform_post_id: String(apiResponse.id || apiResponse.video_id || ''),
    create_username: apiResponse.username || apiResponse.author?.username || '',
    posted_at: apiResponse.create_time ?
      new Date(apiResponse.create_time * 1000).toISOString() : '',
    caption_or_description: apiResponse.video_description || apiResponse.desc || '',
    region_code: apiResponse.region_code || '',
    music_id: String(apiResponse.music_id || ''), // Store as string per spec
    hashtag_names: apiResponse.hashtag_names || [],
    effect_ids: apiResponse.effect_ids || [],
    favorites_count: apiResponse.favorites_count ?? apiResponse.favourite_count ?? '',
    video_duration: apiResponse.video_duration || apiResponse.duration || '',
    is_stem_verified: apiResponse.is_stem_verified ?? '',
    voice_to_text: apiResponse.voice_to_text || '',
    view: apiResponse.view_count ?? apiResponse.views ?? '',
    like: apiResponse.like_count ?? apiResponse.likes ?? '',
    comments: apiResponse.comment_count ?? apiResponse.comments ?? '',
    share_count: apiResponse.share_count ?? apiResponse.shares ?? '',
    playlist_id: apiResponse.playlist_id || '',
    hashtag_info_list: apiResponse.hashtag_info_list || [],
    sticker_info_list: apiResponse.sticker_info_list || [],
    effect_info_list: apiResponse.effect_info_list || [],
    video_mention_list: apiResponse.video_mention_list || [],
    video_label: apiResponse.video_label || '',
    video_tag: apiResponse.video_tag || '',
    drive_url: driveUrl,
    memo: memo
  };
}

/**
 * Normalize Instagram API response to match column schema
 * @param {Object} apiResponse - Raw Instagram API response for a media
 * @param {string} driveUrl - The Drive URL for the artifact
 * @param {string} memo - Any memo notes
 * @returns {Object} Normalized post data matching column schema
 */
function normalizeInstagramPost(apiResponse, driveUrl, memo = '') {
  // Extract shortcode from permalink if not directly available
  let shortcode = apiResponse.shortcode || '';
  if (!shortcode && apiResponse.permalink) {
    const match = apiResponse.permalink.match(/\/p\/([^\/]+)/);
    if (match) {
      shortcode = match[1];
    }
  }

  return {
    platform_post_id: String(apiResponse.id || ''),
    create_username: apiResponse.username || apiResponse.owner?.username || '',
    posted_at: apiResponse.timestamp ?
      new Date(apiResponse.timestamp).toISOString() : '',
    caption_or_description: apiResponse.caption || '',
    post_url: apiResponse.permalink || '',
    like_count: apiResponse.like_count ?? '',
    comments_count: apiResponse.comments_count ?? '',
    media_type: apiResponse.media_type || '',
    media_url: apiResponse.media_url || '',
    thumbnail_url: apiResponse.thumbnail_url || '',
    shortcode: shortcode,
    media_product_type: apiResponse.media_product_type || '',
    is_comment_enabled: apiResponse.is_comment_enabled ?? '',
    is_shared_to_feed: apiResponse.is_shared_to_feed ?? '',
    children: apiResponse.children?.data || [],
    edges_comments: apiResponse.comments?.data || [],
    edges_insights: apiResponse.insights?.data || [],
    edges_collaborators: apiResponse.collaborators || [],
    boost_ads_list: apiResponse.boost_ads_list || [],
    boost_eligibility_info: apiResponse.boost_eligibility_info || '',
    copyright_check_information_status: apiResponse.copyright_check_information?.status || '',
    drive_url: driveUrl,
    memo: memo
  };
}

/**
 * Update the memo for a specific row
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} platform - 'instagram' or 'tiktok'
 * @param {number} rowIndex - The row index (1-based, excluding header)
 * @param {string} memo - The memo text
 */
function updateRowMemo(spreadsheetId, platform, rowIndex, memo) {
  const sheet = getSheetForPlatform(spreadsheetId, platform);
  const columns = getColumnsForPlatform(platform);
  const memoColIndex = columns.indexOf('memo') + 1;

  // Row index is 1-based for data rows, add 1 for header
  const actualRow = rowIndex + 1;
  sheet.getRange(actualRow, memoColIndex).setValue(memo);
}

/**
 * Finalize the spreadsheet (auto-resize columns, etc.)
 * @param {string} spreadsheetId - The spreadsheet ID
 */
function finalizeSpreadsheet(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  // Process each sheet
  ['Instagram', 'TikTok'].forEach(sheetName => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (sheet) {
      const lastCol = sheet.getLastColumn();
      // Auto-resize all columns
      for (let i = 1; i <= lastCol; i++) {
        try {
          sheet.autoResizeColumn(i);
        } catch (e) {
          // Ignore errors for empty columns
        }
      }
    }
  });
}
