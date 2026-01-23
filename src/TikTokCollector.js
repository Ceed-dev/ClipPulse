/**
 * TikTokCollector.js
 * Collects video data from TikTok using Research API (primary) or Display API (fallback)
 *
 * Specification sections 10.3, 11.1
 *
 * Research API: Query public content via structured query conditions
 * Display API: Fallback when Research API is unavailable
 */

/**
 * TikTok Research API base URL
 */
const TIKTOK_RESEARCH_API_BASE = 'https://open.tiktokapis.com/v2/research';

/**
 * TikTok Display API base URL
 */
const TIKTOK_DISPLAY_API_BASE = 'https://open.tiktokapis.com/v2';

/**
 * Fields to request from TikTok Research API
 * Based on specification section 9.3
 */
const TIKTOK_RESEARCH_FIELDS = [
  'id',
  'create_time',
  'username',
  'region_code',
  'video_description',
  'music_id',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
  'effect_ids',
  'hashtag_names',
  'playlist_id',
  'voice_to_text',
  'is_stem_verified',
  'video_duration',
  'hashtag_info_list',
  'sticker_info_list',
  'effect_info_list',
  'video_mention_list',
  'video_label',
  'favorites_count'
];

/**
 * Build query conditions for TikTok Research API
 * @param {Object} plan - The collection plan
 * @returns {Object} Query conditions object
 */
function buildTikTokQueryConditions(plan) {
  const conditions = {
    and: []
  };

  // Add keyword condition
  if (plan.keywords && plan.keywords.length > 0) {
    conditions.and.push({
      operation: 'IN',
      field_name: 'keyword',
      field_values: plan.keywords
    });
  }

  // Add hashtag condition
  if (plan.hashtags && plan.hashtags.length > 0) {
    conditions.and.push({
      operation: 'IN',
      field_name: 'hashtag_name',
      field_values: plan.hashtags
    });
  }

  // Add region code if specified
  if (plan.regionCode) {
    conditions.and.push({
      operation: 'EQ',
      field_name: 'region_code',
      field_values: [plan.regionCode]
    });
  }

  // Add date range
  const endDate = plan.timeWindow?.endDate ? new Date(plan.timeWindow.endDate) : new Date();
  const startDate = plan.timeWindow?.startDate ?
    new Date(plan.timeWindow.startDate) :
    new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days

  conditions.and.push({
    operation: 'GTE',
    field_name: 'create_date',
    field_values: [formatDateForTikTok(startDate)]
  });

  conditions.and.push({
    operation: 'LTE',
    field_name: 'create_date',
    field_values: [formatDateForTikTok(endDate)]
  });

  // If no meaningful conditions, use a broad keyword search
  if (conditions.and.length <= 2) { // Only date conditions
    if (plan.contentCategory) {
      conditions.and.push({
        operation: 'IN',
        field_name: 'keyword',
        field_values: [plan.contentCategory]
      });
    }
  }

  return conditions;
}

/**
 * Format date for TikTok API (YYYYMMDD)
 * @param {Date} date
 * @returns {string}
 */
function formatDateForTikTok(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyyMMdd');
}

/**
 * Query TikTok Research API for videos
 * @param {Object} params - Query parameters
 * @param {Object} params.conditions - Query conditions
 * @param {number} params.maxCount - Maximum videos to return (max 100 per request)
 * @param {string} [params.cursor] - Pagination cursor
 * @param {string} [params.searchId] - Search ID for pagination
 * @param {boolean} [params.isRandom] - Whether to randomize results
 * @returns {Object} API response with videos and pagination info
 */
function queryTikTokResearchAPI(params) {
  const accessToken = getTikTokResearchAccessToken();
  if (!accessToken) {
    throw new Error('TikTok Research API access token not available');
  }

  const requestBody = {
    query: params.conditions,
    max_count: Math.min(params.maxCount || 20, 100),
    fields: TIKTOK_RESEARCH_FIELDS
  };

  if (params.cursor) {
    requestBody.cursor = params.cursor;
  }
  if (params.searchId) {
    requestBody.search_id = params.searchId;
  }
  if (params.isRandom) {
    requestBody.is_random = true;
  }

  const response = UrlFetchApp.fetch(`${TIKTOK_RESEARCH_API_BASE}/video/query/`, {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    console.error('TikTok Research API error:', responseBody);
    throw new Error(`TikTok Research API error: ${responseBody.error?.message || JSON.stringify(responseBody)}`);
  }

  return {
    videos: responseBody.data?.videos || [],
    cursor: responseBody.data?.cursor,
    searchId: responseBody.data?.search_id,
    hasMore: responseBody.data?.has_more || false
  };
}

/**
 * Collect TikTok videos for a run
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectTikTokVideos(runId, plan, onProgress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found: ${runId}`);
  }

  const targetCount = plan.targetCounts.tiktok || 0;
  if (targetCount === 0) {
    return { collected: 0, skipped: 0 };
  }

  // Check which API to use
  const useResearchAPI = isTikTokResearchConfigured();
  const useDisplayAPI = !useResearchAPI && isTikTokDisplayConfigured();

  if (!useResearchAPI && !useDisplayAPI) {
    throw new Error('No TikTok API configured');
  }

  if (useResearchAPI) {
    return collectTikTokViaResearchAPI(runId, plan, targetCount, onProgress);
  } else {
    return collectTikTokViaDisplayAPI(runId, plan, targetCount, onProgress);
  }
}

/**
 * Collect TikTok videos via Research API
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} targetCount - Target number of videos
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectTikTokViaResearchAPI(runId, plan, targetCount, onProgress) {
  const state = loadRunState(runId);
  const operationalConfig = getOperationalConfig();
  const batchSize = operationalConfig.batchSize;

  let collected = state.tiktokProgress.collected || 0;
  let cursor = state.tiktokProgress.cursor;
  let searchId = state.tiktokProgress.searchId;
  let skipped = 0;
  let attempts = 0;
  const maxAttempts = 10; // Prevent infinite loops

  const conditions = buildTikTokQueryConditions(plan);
  const postsToWrite = [];

  while (collected < targetCount && attempts < maxAttempts) {
    attempts++;

    try {
      const result = queryTikTokResearchAPI({
        conditions: conditions,
        maxCount: Math.min(batchSize, targetCount - collected),
        cursor: cursor,
        searchId: searchId,
        isRandom: plan.queryStrategy?.tiktok?.isRandom || false
      });

      if (!result.videos || result.videos.length === 0) {
        console.log('No more TikTok videos available');
        break;
      }

      // Update pagination
      cursor = result.cursor;
      searchId = result.searchId;

      // Process videos
      for (const video of result.videos) {
        const videoId = String(video.id);

        // Check for duplicates (spec section 10.4)
        if (isPostProcessed(runId, 'tiktok', videoId)) {
          skipped++;
          continue;
        }

        // Create artifacts
        const artifactResult = createPostArtifacts(
          state.tiktokFolderId,
          videoId,
          {
            create_username: video.username,
            share_url: null, // Research API doesn't provide this
            embed_link: null
          },
          video,
          'tiktok'
        );

        // Normalize and prepare row data
        const normalizedPost = normalizeTikTokPost(video, artifactResult.driveUrl, artifactResult.memo);
        postsToWrite.push(normalizedPost);

        // Mark as processed
        addProcessedPostId(runId, 'tiktok', videoId);
        collected++;

        if (collected >= targetCount) {
          break;
        }
      }

      // Write batch to spreadsheet
      if (postsToWrite.length >= batchSize || collected >= targetCount) {
        appendRowsBatch(state.spreadsheetId, 'tiktok', postsToWrite);
        postsToWrite.length = 0; // Clear array

        // Update progress
        updateTikTokProgress(runId, {
          collected: collected,
          cursor: cursor,
          searchId: searchId
        });

        if (onProgress) {
          onProgress({ platform: 'tiktok', collected: collected, target: targetCount });
        }
      }

      // Check if more results available
      if (!result.hasMore) {
        console.log('No more TikTok results available');
        break;
      }

    } catch (e) {
      console.error('Error collecting TikTok video:', e);
      // Continue to next iteration
    }
  }

  // Write any remaining posts
  if (postsToWrite.length > 0) {
    appendRowsBatch(state.spreadsheetId, 'tiktok', postsToWrite);
    updateTikTokProgress(runId, {
      collected: collected,
      cursor: cursor,
      searchId: searchId
    });
  }

  return { collected, skipped };
}

/**
 * Collect TikTok videos via Display API (fallback)
 * Note: Display API is limited to the authorized user's context
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} targetCount - Target number of videos
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectTikTokViaDisplayAPI(runId, plan, targetCount, onProgress) {
  const state = loadRunState(runId);
  const accessToken = getTikTokDisplayAccessToken();

  if (!accessToken) {
    throw new Error('TikTok Display API not authorized');
  }

  let collected = state.tiktokProgress.collected || 0;
  let cursor = state.tiktokProgress.cursor;
  const postsToWrite = [];

  // Display API only allows fetching the authorized user's videos
  // This is a significant limitation for trend research
  const memoPrefix = 'TikTok Research API unavailable; used Display API fallback; many fields missing';

  try {
    const response = UrlFetchApp.fetch(
      `${TIKTOK_DISPLAY_API_BASE}/video/list/?fields=id,create_time,cover_image_url,share_url,video_description,duration,title` +
      (cursor ? `&cursor=${cursor}` : '') +
      `&max_count=${Math.min(20, targetCount - collected)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        muteHttpExceptions: true
      }
    );

    const data = JSON.parse(response.getContentText());

    if (data.data?.videos) {
      for (const video of data.data.videos) {
        const videoId = String(video.id);

        if (isPostProcessed(runId, 'tiktok', videoId)) {
          continue;
        }

        // Create artifacts
        const artifactResult = createPostArtifacts(
          state.tiktokFolderId,
          videoId,
          {
            create_username: '', // Not available in Display API list
            share_url: video.share_url
          },
          video,
          'tiktok'
        );

        // Limited normalization for Display API
        const normalizedPost = {
          platform_post_id: videoId,
          create_username: '',
          posted_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : '',
          caption_or_description: video.video_description || video.title || '',
          region_code: '',
          music_id: '',
          hashtag_names: [],
          effect_ids: [],
          favorites_count: '',
          video_duration: video.duration || '',
          is_stem_verified: '',
          voice_to_text: '',
          view: '',
          like: '',
          comments: '',
          share_count: '',
          playlist_id: '',
          hashtag_info_list: [],
          sticker_info_list: [],
          effect_info_list: [],
          video_mention_list: [],
          video_label: '',
          video_tag: '',
          drive_url: artifactResult.driveUrl,
          memo: memoPrefix + (artifactResult.memo ? '; ' + artifactResult.memo : '')
        };

        postsToWrite.push(normalizedPost);
        addProcessedPostId(runId, 'tiktok', videoId);
        collected++;

        if (collected >= targetCount) {
          break;
        }
      }

      cursor = data.data.cursor;
    }

  } catch (e) {
    console.error('Error with TikTok Display API:', e);
  }

  // Write posts
  if (postsToWrite.length > 0) {
    appendRowsBatch(state.spreadsheetId, 'tiktok', postsToWrite);
    updateTikTokProgress(runId, { collected, cursor });

    if (onProgress) {
      onProgress({ platform: 'tiktok', collected, target: targetCount });
    }
  }

  return { collected, skipped: 0 };
}

/**
 * Expand TikTok search if insufficient results
 * @param {string} runId - The run ID
 * @param {Object} plan - The current plan
 * @returns {Object} Updated plan with expanded parameters
 */
function expandTikTokSearch(runId, plan) {
  const state = loadRunState(runId);
  const currentCount = state.tiktokProgress.collected;
  const targetCount = state.tiktokProgress.target;

  if (currentCount >= targetCount) {
    return plan;
  }

  // Get fallback strategy
  const fallback = generateFallbackStrategy(plan, 'tiktok', currentCount, targetCount);

  // Apply fallback modifications
  if (fallback.expandDateRange) {
    const days = fallback.newDateRange?.days || 30;
    plan.timeWindow = plan.timeWindow || {};
    plan.timeWindow.startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  if (fallback.additionalKeywords && fallback.additionalKeywords.length > 0) {
    plan.keywords = [...(plan.keywords || []), ...fallback.additionalKeywords];
  }

  if (fallback.useRandom) {
    plan.queryStrategy = plan.queryStrategy || {};
    plan.queryStrategy.tiktok = plan.queryStrategy.tiktok || {};
    plan.queryStrategy.tiktok.isRandom = true;
  }

  return plan;
}
