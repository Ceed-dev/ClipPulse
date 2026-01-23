/**
 * InstagramCollector.js
 * Collects media data from Instagram using Graph API
 *
 * Specification sections 10.3, 11.2
 *
 * Strategies:
 * - Hashtag-based retrieval (preferred for trend discovery)
 * - Owned-account media retrieval (fallback)
 */

/**
 * Instagram Graph API fields to request
 * Based on specification section 9.4
 */
const INSTAGRAM_MEDIA_FIELDS = [
  'id',
  'username',
  'timestamp',
  'caption',
  'permalink',
  'like_count',
  'comments_count',
  'media_type',
  'media_url',
  'thumbnail_url',
  'shortcode',
  'media_product_type',
  'is_comment_enabled',
  'is_shared_to_feed',
  'children{id,media_type,media_url,thumbnail_url}'
].join(',');

/**
 * Build the Graph API URL for a request
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {string} Full URL
 */
function buildInstagramApiUrl(endpoint, params = {}) {
  const version = getGraphApiVersion();
  const baseUrl = `https://graph.facebook.com/${version}/${endpoint}`;

  const queryParams = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
}

/**
 * Make a request to Instagram Graph API
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
function callInstagramAPI(endpoint, params = {}) {
  const accessToken = getMetaAccessToken();
  if (!accessToken) {
    throw new Error('Instagram not authorized');
  }

  params.access_token = accessToken;
  const url = buildInstagramApiUrl(endpoint, params);

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    console.error('Instagram API error:', responseBody);
    throw new Error(`Instagram API error: ${responseBody.error?.message || 'Unknown error'}`);
  }

  return responseBody;
}

/**
 * Search for a hashtag ID by name
 * @param {string} hashtagName - The hashtag (without #)
 * @returns {string|null} The hashtag ID or null
 */
function searchHashtagId(hashtagName) {
  const igUserId = getInstagramUserId();
  if (!igUserId) {
    throw new Error('Instagram User ID not configured');
  }

  try {
    const response = callInstagramAPI('ig_hashtag_search', {
      user_id: igUserId,
      q: hashtagName
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].id;
    }
    return null;

  } catch (e) {
    console.error(`Error searching hashtag "${hashtagName}":`, e);
    return null;
  }
}

/**
 * Get recent media for a hashtag
 * @param {string} hashtagId - The hashtag ID
 * @param {number} limit - Maximum media to return
 * @param {string} [cursor] - Pagination cursor
 * @returns {Object} Media data with pagination info
 */
function getHashtagRecentMedia(hashtagId, limit = 50, cursor = null) {
  const igUserId = getInstagramUserId();
  if (!igUserId) {
    throw new Error('Instagram User ID not configured');
  }

  const params = {
    user_id: igUserId,
    fields: INSTAGRAM_MEDIA_FIELDS,
    limit: Math.min(limit, 50) // API max is 50
  };

  if (cursor) {
    params.after = cursor;
  }

  const response = callInstagramAPI(`${hashtagId}/recent_media`, params);

  return {
    media: response.data || [],
    cursor: response.paging?.cursors?.after || null,
    hasMore: !!response.paging?.next
  };
}

/**
 * Get top media for a hashtag
 * @param {string} hashtagId - The hashtag ID
 * @param {number} limit - Maximum media to return
 * @returns {Object} Media data
 */
function getHashtagTopMedia(hashtagId, limit = 50) {
  const igUserId = getInstagramUserId();
  if (!igUserId) {
    throw new Error('Instagram User ID not configured');
  }

  const response = callInstagramAPI(`${hashtagId}/top_media`, {
    user_id: igUserId,
    fields: INSTAGRAM_MEDIA_FIELDS,
    limit: Math.min(limit, 50)
  });

  return {
    media: response.data || [],
    hasMore: false // Top media doesn't support pagination
  };
}

/**
 * Get media from the authenticated user's account
 * @param {number} limit - Maximum media to return
 * @param {string} [cursor] - Pagination cursor
 * @returns {Object} Media data with pagination info
 */
function getOwnAccountMedia(limit = 50, cursor = null) {
  const igUserId = getInstagramUserId();
  if (!igUserId) {
    throw new Error('Instagram User ID not configured');
  }

  const params = {
    fields: INSTAGRAM_MEDIA_FIELDS,
    limit: Math.min(limit, 50)
  };

  if (cursor) {
    params.after = cursor;
  }

  const response = callInstagramAPI(`${igUserId}/media`, params);

  return {
    media: response.data || [],
    cursor: response.paging?.cursors?.after || null,
    hasMore: !!response.paging?.next
  };
}

/**
 * Get detailed information for a specific media
 * @param {string} mediaId - The media ID
 * @returns {Object} Media details
 */
function getMediaDetails(mediaId) {
  const response = callInstagramAPI(mediaId, {
    fields: INSTAGRAM_MEDIA_FIELDS
  });

  return response;
}

/**
 * Get insights for a media (only works for own account media)
 * @param {string} mediaId - The media ID
 * @returns {Object|null} Insights data or null
 */
function getMediaInsights(mediaId) {
  try {
    const response = callInstagramAPI(`${mediaId}/insights`, {
      metric: 'engagement,impressions,reach,saved'
    });
    return response.data || null;
  } catch (e) {
    // Insights may not be available for all media
    return null;
  }
}

/**
 * Get comments for a media
 * @param {string} mediaId - The media ID
 * @param {number} limit - Maximum comments
 * @returns {Object|null} Comments data or null
 */
function getMediaComments(mediaId, limit = 10) {
  try {
    const response = callInstagramAPI(`${mediaId}/comments`, {
      fields: 'id,text,username,timestamp,like_count',
      limit: limit
    });
    return response.data || null;
  } catch (e) {
    return null;
  }
}

/**
 * Collect Instagram media for a run
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectInstagramMedia(runId, plan, onProgress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found: ${runId}`);
  }

  const targetCount = plan.targetCounts.instagram || 0;
  if (targetCount === 0) {
    return { collected: 0, skipped: 0 };
  }

  if (!isMetaAuthorized()) {
    throw new Error('Instagram not authorized');
  }

  const strategy = plan.queryStrategy?.instagram?.primaryStrategy || 'hashtag';

  if (strategy === 'hashtag' && (plan.hashtags?.length > 0 || plan.keywords?.length > 0)) {
    return collectInstagramViaHashtags(runId, plan, targetCount, onProgress);
  } else {
    return collectInstagramViaOwnAccount(runId, plan, targetCount, onProgress);
  }
}

/**
 * Collect Instagram media via hashtag search
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} targetCount - Target number of media
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectInstagramViaHashtags(runId, plan, targetCount, onProgress) {
  const state = loadRunState(runId);
  const operationalConfig = getOperationalConfig();
  const batchSize = operationalConfig.batchSize;

  let collected = state.instagramProgress.collected || 0;
  let skipped = 0;
  const postsToWrite = [];

  // Get hashtags to search
  const hashtagsToSearch = plan.queryStrategy?.instagram?.hashtagsToSearch ||
    plan.hashtags ||
    plan.keywords?.slice(0, 3) ||
    [];

  if (hashtagsToSearch.length === 0) {
    console.log('No hashtags to search, falling back to own account');
    return collectInstagramViaOwnAccount(runId, plan, targetCount, onProgress);
  }

  // Search each hashtag
  for (const hashtag of hashtagsToSearch) {
    if (collected >= targetCount) {
      break;
    }

    console.log(`Searching Instagram hashtag: ${hashtag}`);

    const hashtagId = searchHashtagId(hashtag);
    if (!hashtagId) {
      console.log(`Hashtag not found: ${hashtag}`);
      continue;
    }

    // Get top media first (usually more relevant)
    try {
      const topMedia = getHashtagTopMedia(hashtagId, Math.min(25, targetCount - collected));

      for (const media of topMedia.media) {
        if (collected >= targetCount) break;

        const result = processInstagramMedia(runId, state, media);
        if (result.processed) {
          postsToWrite.push(result.normalizedPost);
          collected++;
        } else if (result.skipped) {
          skipped++;
        }
      }
    } catch (e) {
      console.error(`Error getting top media for hashtag ${hashtag}:`, e);
    }

    // Get recent media if we need more
    if (collected < targetCount) {
      try {
        let cursor = null;
        let attempts = 0;

        while (collected < targetCount && attempts < 5) {
          attempts++;

          const recentMedia = getHashtagRecentMedia(
            hashtagId,
            Math.min(batchSize, targetCount - collected),
            cursor
          );

          if (!recentMedia.media || recentMedia.media.length === 0) {
            break;
          }

          for (const media of recentMedia.media) {
            if (collected >= targetCount) break;

            const result = processInstagramMedia(runId, state, media);
            if (result.processed) {
              postsToWrite.push(result.normalizedPost);
              collected++;
            } else if (result.skipped) {
              skipped++;
            }
          }

          cursor = recentMedia.cursor;

          if (!recentMedia.hasMore) {
            break;
          }
        }
      } catch (e) {
        console.error(`Error getting recent media for hashtag ${hashtag}:`, e);
      }
    }

    // Write batch to spreadsheet
    if (postsToWrite.length >= batchSize) {
      appendRowsBatch(state.spreadsheetId, 'instagram', postsToWrite);
      postsToWrite.length = 0;

      updateInstagramProgress(runId, { collected });

      if (onProgress) {
        onProgress({ platform: 'instagram', collected, target: targetCount });
      }
    }
  }

  // Write remaining posts
  if (postsToWrite.length > 0) {
    appendRowsBatch(state.spreadsheetId, 'instagram', postsToWrite);
    updateInstagramProgress(runId, { collected });

    if (onProgress) {
      onProgress({ platform: 'instagram', collected, target: targetCount });
    }
  }

  return { collected, skipped };
}

/**
 * Collect Instagram media via own account (fallback)
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} targetCount - Target number of media
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection results
 */
function collectInstagramViaOwnAccount(runId, plan, targetCount, onProgress) {
  const state = loadRunState(runId);
  const operationalConfig = getOperationalConfig();
  const batchSize = operationalConfig.batchSize;

  let collected = state.instagramProgress.collected || 0;
  let cursor = state.instagramProgress.cursor;
  let skipped = 0;
  const postsToWrite = [];

  const memoPrefix = 'collected from own account (not hashtag search)';

  let attempts = 0;
  while (collected < targetCount && attempts < 10) {
    attempts++;

    try {
      const mediaResult = getOwnAccountMedia(
        Math.min(batchSize, targetCount - collected),
        cursor
      );

      if (!mediaResult.media || mediaResult.media.length === 0) {
        break;
      }

      for (const media of mediaResult.media) {
        if (collected >= targetCount) break;

        const result = processInstagramMedia(runId, state, media, memoPrefix);
        if (result.processed) {
          postsToWrite.push(result.normalizedPost);
          collected++;
        } else if (result.skipped) {
          skipped++;
        }
      }

      cursor = mediaResult.cursor;

      // Write batch
      if (postsToWrite.length >= batchSize || !mediaResult.hasMore) {
        appendRowsBatch(state.spreadsheetId, 'instagram', postsToWrite);
        postsToWrite.length = 0;

        updateInstagramProgress(runId, { collected, cursor });

        if (onProgress) {
          onProgress({ platform: 'instagram', collected, target: targetCount });
        }
      }

      if (!mediaResult.hasMore) {
        break;
      }

    } catch (e) {
      console.error('Error collecting from own account:', e);
      break;
    }
  }

  // Write remaining posts
  if (postsToWrite.length > 0) {
    appendRowsBatch(state.spreadsheetId, 'instagram', postsToWrite);
    updateInstagramProgress(runId, { collected, cursor });
  }

  return { collected, skipped };
}

/**
 * Process a single Instagram media item
 * @param {string} runId - The run ID
 * @param {Object} state - The run state
 * @param {Object} media - The media object
 * @param {string} [memoPrefix] - Optional prefix for memo
 * @returns {Object} Processing result
 */
function processInstagramMedia(runId, state, media, memoPrefix = '') {
  const mediaId = String(media.id);

  // Check for duplicates
  if (isPostProcessed(runId, 'instagram', mediaId)) {
    return { skipped: true, processed: false };
  }

  const memoNotes = memoPrefix ? [memoPrefix] : [];

  // Try to get additional data
  let insights = null;
  let comments = null;

  try {
    insights = getMediaInsights(mediaId);
  } catch (e) {
    memoNotes.push('insights unavailable');
  }

  try {
    comments = getMediaComments(mediaId, 5);
  } catch (e) {
    // Comments may not be available
  }

  // Create artifacts
  const artifactResult = createPostArtifacts(
    state.instagramFolderId,
    mediaId,
    {
      media_url: media.media_url,
      media_type: media.media_type,
      thumbnail_url: media.thumbnail_url,
      post_url: media.permalink,
      shortcode: media.shortcode,
      create_username: media.username
    },
    media,
    'instagram'
  );

  if (artifactResult.memo) {
    memoNotes.push(artifactResult.memo);
  }

  // Normalize post data
  const normalizedPost = normalizeInstagramPost(
    {
      ...media,
      insights: insights ? { data: insights } : null,
      comments: comments ? { data: comments } : null
    },
    artifactResult.driveUrl,
    memoNotes.join('; ')
  );

  // Mark as processed
  addProcessedPostId(runId, 'instagram', mediaId);

  return {
    processed: true,
    skipped: false,
    normalizedPost: normalizedPost
  };
}

/**
 * Expand Instagram search if insufficient results
 * @param {string} runId - The run ID
 * @param {Object} plan - The current plan
 * @returns {Object} Updated plan with expanded parameters
 */
function expandInstagramSearch(runId, plan) {
  const state = loadRunState(runId);
  const currentCount = state.instagramProgress.collected;
  const targetCount = state.instagramProgress.target;

  if (currentCount >= targetCount) {
    return plan;
  }

  // Generate additional hashtags from keywords
  const existingHashtags = plan.hashtags || [];
  const keywords = plan.keywords || [];

  // Add keywords as potential hashtags
  const additionalHashtags = keywords.filter(k => !existingHashtags.includes(k));

  plan.queryStrategy = plan.queryStrategy || {};
  plan.queryStrategy.instagram = plan.queryStrategy.instagram || {};
  plan.queryStrategy.instagram.hashtagsToSearch = [
    ...existingHashtags,
    ...additionalHashtags
  ];

  // If still not enough, we might try related terms
  if (plan.keywords && plan.keywords.length > 0 && additionalHashtags.length === 0) {
    const relatedKeywords = generateRelatedKeywords(plan.keywords[0]);
    plan.queryStrategy.instagram.hashtagsToSearch.push(...relatedKeywords.slice(0, 3));
  }

  return plan;
}
