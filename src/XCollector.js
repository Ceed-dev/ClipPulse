/**
 * XCollector.js
 * Collects tweet data from X (Twitter) using TwitterAPI.io Advanced Search
 *
 * API Endpoint: https://api.twitterapi.io/twitter/tweet/advanced_search
 * Documentation: https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search
 */

/**
 * X API base URL
 */
const X_API_BASE = 'https://api.twitterapi.io/twitter/tweet';

/**
 * Build the X API URL for a request
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {string} Full URL
 */
function buildXApiUrl(endpoint, params = {}) {
  const baseUrl = `${X_API_BASE}/${endpoint}`;

  const queryParams = Object.entries(params)
    .filter(([key, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
}

/**
 * Make a request to X API
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
function callXAPI(endpoint, params = {}) {
  const apiKey = getConfig(CONFIG_KEYS.X_API_KEY);
  if (!apiKey) {
    throw new Error('X API key not configured');
  }

  const url = buildXApiUrl(endpoint, params);

  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey
    },
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    console.error('X API error:', responseBody);
    throw new Error(`X API error: ${responseBody.error?.message || responseBody.message || 'Unknown error'}`);
  }

  return responseBody;
}

/**
 * Search tweets using Advanced Search API
 * @param {string} query - Search query
 * @param {string} queryType - 'Latest' or 'Top'
 * @param {string} [cursor] - Pagination cursor
 * @returns {Object} Search results with tweets and pagination info
 */
function searchTweets(query, queryType = 'Latest', cursor = null) {
  const params = {
    query: query,
    queryType: queryType
  };

  if (cursor) {
    params.cursor = cursor;
  }

  const response = callXAPI('advanced_search', params);

  return {
    tweets: response.tweets || [],
    hasMore: response.has_next_page || false,
    cursor: response.next_cursor || null
  };
}

/**
 * Build X search query from plan
 * Converts plan keywords, hashtags, and other parameters into X query syntax
 * @param {Object} plan - The collection plan
 * @returns {string} X search query
 */
function buildXSearchQuery(plan) {
  const queryParts = [];

  // Get X-specific query strategy
  const xStrategy = plan.queryStrategy?.x || {};

  // If there's a custom query, use it directly
  if (xStrategy.customQuery) {
    return xStrategy.customQuery;
  }

  // Add keywords
  if (plan.keywords && plan.keywords.length > 0) {
    // Join keywords with OR for broader search
    const keywordQuery = plan.keywords.map(k => `"${k}"`).join(' OR ');
    queryParts.push(`(${keywordQuery})`);
  }

  // Add hashtags
  if (plan.hashtags && plan.hashtags.length > 0) {
    const hashtagQuery = plan.hashtags.map(h => `#${h}`).join(' OR ');
    queryParts.push(`(${hashtagQuery})`);
  }

  // Add user filter if specified
  if (xStrategy.fromUsers && xStrategy.fromUsers.length > 0) {
    const userQuery = xStrategy.fromUsers.map(u => `from:${u}`).join(' OR ');
    queryParts.push(`(${userQuery})`);
  }

  // Add date range if specified
  if (plan.timeWindow?.startDate) {
    const startDate = new Date(plan.timeWindow.startDate);
    const formattedStart = formatDateForX(startDate);
    queryParts.push(`since:${formattedStart}`);
  }

  if (plan.timeWindow?.endDate) {
    const endDate = new Date(plan.timeWindow.endDate);
    const formattedEnd = formatDateForX(endDate);
    queryParts.push(`until:${formattedEnd}`);
  }

  // Add language filter if specified
  if (xStrategy.language) {
    queryParts.push(`lang:${xStrategy.language}`);
  }

  // Exclude retweets by default unless specified
  if (xStrategy.includeRetweets !== true) {
    queryParts.push('-is:retweet');
  }

  // If no query parts, use content category or default
  if (queryParts.length === 0) {
    if (plan.contentCategory) {
      queryParts.push(`"${plan.contentCategory}"`);
    } else {
      throw new Error('No search criteria specified for X');
    }
  }

  return queryParts.join(' ');
}

/**
 * Format date for X API query
 * @param {Date} date
 * @returns {string} Formatted date string (YYYY-MM-DD_HH:mm:ss_UTC)
 */
function formatDateForX(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd_HH:mm:ss') + '_UTC';
}

/**
 * Collect X tweets for a run
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectXTweets(runId, plan, onProgress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found: ${runId}`);
  }

  const targetCount = plan.targetCounts.x || 0;
  if (targetCount === 0) {
    return { collected: 0, skipped: 0 };
  }

  // Check if X API is configured
  if (!isXConfigured()) {
    throw new Error('X API not configured');
  }

  return collectXViaTweetsSearch(runId, plan, targetCount, onProgress);
}

/**
 * Collect X tweets via Advanced Search API
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} targetCount - Target number of tweets
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectXViaTweetsSearch(runId, plan, targetCount, onProgress) {
  const state = loadRunState(runId);
  const operationalConfig = getOperationalConfig();
  const batchSize = operationalConfig.batchSize;

  let collected = state.xProgress?.collected || 0;
  let cursor = state.xProgress?.cursor || null;
  let skipped = 0;
  const postsToWrite = [];
  const processedIds = new Set();

  // Build search query
  const searchQuery = buildXSearchQuery(plan);
  const queryType = plan.queryStrategy?.x?.queryType || 'Latest';

  console.log(`Starting X collection. Target: ${targetCount}, Query: ${searchQuery}`);

  let attempts = 0;
  const maxAttempts = 20; // Prevent infinite loops

  while (collected < targetCount && attempts < maxAttempts) {
    attempts++;

    try {
      const result = searchTweets(searchQuery, queryType, cursor);

      if (!result.tweets || result.tweets.length === 0) {
        console.log('No more tweets available');
        break;
      }

      console.log(`Got ${result.tweets.length} tweets (attempt ${attempts})`);

      for (const tweet of result.tweets) {
        if (collected >= targetCount) break;

        const tweetId = String(tweet.id);

        // Skip duplicates
        if (processedIds.has(tweetId) || isPostProcessed(runId, 'x', tweetId)) {
          skipped++;
          continue;
        }

        // Process tweet with Drive artifact creation
        const processResult = processXTweet(runId, state, tweet);
        if (processResult.processed) {
          postsToWrite.push(processResult.normalizedPost);
          processedIds.add(tweetId);
          addProcessedPostId(runId, 'x', tweetId);
          collected++;
        }
      }

      cursor = result.cursor;

      // Write batch to spreadsheet periodically
      if (postsToWrite.length >= batchSize || !result.hasMore) {
        if (postsToWrite.length > 0) {
          console.log(`Writing ${postsToWrite.length} tweets to spreadsheet`);
          appendRowsBatch(state.spreadsheetId, 'x', postsToWrite);
          postsToWrite.length = 0;

          updateXProgress(runId, { collected, cursor });

          if (onProgress) {
            onProgress({ platform: 'x', collected, target: targetCount });
          }
        }
      }

      if (!result.hasMore) {
        console.log('No more pages available');
        break;
      }

    } catch (e) {
      console.error('Error collecting tweets:', e);
      // Continue to next iteration or break depending on error type
      if (e.message.includes('rate limit')) {
        Utilities.sleep(5000);
      } else {
        break;
      }
    }
  }

  // Write remaining posts
  if (postsToWrite.length > 0) {
    console.log(`Writing final ${postsToWrite.length} tweets to spreadsheet`);
    appendRowsBatch(state.spreadsheetId, 'x', postsToWrite);
    updateXProgress(runId, { collected, cursor });
  }

  return { collected, skipped };
}

/**
 * Process a single tweet
 * Creates Drive artifacts and normalizes data
 * @param {string} runId - The run ID
 * @param {Object} state - The run state
 * @param {Object} tweet - The tweet object from API
 * @returns {Object} Processing result
 */
function processXTweet(runId, state, tweet) {
  const tweetId = String(tweet.id);
  const memoNotes = [];

  // Create Drive artifact
  let driveUrl = '';
  try {
    const postFolder = createPostFolder(state.xFolderId, tweetId);

    // Save raw JSON
    saveRawJson(postFolder, tweet);

    // Create watch artifact with tweet URL
    const watchFile = createWatchArtifact(postFolder, {
      watchUrl: tweet.url || `https://x.com/i/status/${tweetId}`,
      username: tweet.author?.userName || '',
      platform: 'X'
    });
    driveUrl = getFileUrl(watchFile);

  } catch (e) {
    console.error(`Error creating Drive artifact for tweet ${tweetId}:`, e.message);
    memoNotes.push('Drive artifact creation failed: ' + e.message);
  }

  // Normalize post data
  const normalizedPost = normalizeXPost(tweet, driveUrl, memoNotes.join('; '));

  return {
    processed: true,
    normalizedPost: normalizedPost
  };
}

/**
 * Expand X search if insufficient results
 * @param {string} runId - The run ID
 * @param {Object} plan - The current plan
 * @returns {Object} Updated plan with expanded parameters
 */
function expandXSearch(runId, plan) {
  const state = loadRunState(runId);
  const currentCount = state.xProgress?.collected || 0;
  const targetCount = state.xProgress?.target || 0;

  if (currentCount >= targetCount) {
    return plan;
  }

  // Expand date range
  plan.timeWindow = plan.timeWindow || {};
  const currentStart = plan.timeWindow.startDate ? new Date(plan.timeWindow.startDate) : new Date();
  const expandedStart = new Date(currentStart.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 more days
  plan.timeWindow.startDate = expandedStart.toISOString();

  // Try Top tweets instead of Latest
  plan.queryStrategy = plan.queryStrategy || {};
  plan.queryStrategy.x = plan.queryStrategy.x || {};
  plan.queryStrategy.x.queryType = 'Top';

  return plan;
}

/**
 * Check if X API is configured
 * @returns {boolean}
 */
function isXConfigured() {
  const apiKey = getConfig(CONFIG_KEYS.X_API_KEY);
  const isConfigured = !!apiKey;
  console.log(`[DEBUG] isXConfigured: apiKey=${apiKey ? 'SET (length=' + apiKey.length + ')' : 'NOT SET'}, result=${isConfigured}`);
  return isConfigured;
}

/**
 * Test X API connection
 * @returns {Object} Test result
 */
function testXAPI() {
  try {
    if (!isXConfigured()) {
      return { success: false, message: 'X API key not configured' };
    }

    // Try a simple search
    const result = searchTweets('test', 'Latest');

    return {
      success: true,
      message: 'X API connection successful',
      tweetsFound: result.tweets.length
    };

  } catch (e) {
    return { success: false, message: e.message };
  }
}
