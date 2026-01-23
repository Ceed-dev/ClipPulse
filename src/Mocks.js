/**
 * Mocks.js
 * Mock data and functions for local testing without real API calls
 *
 * To enable mock mode, set USE_MOCKS = true in Script Properties
 */

/**
 * Check if mock mode is enabled
 * @returns {boolean}
 */
function isMockMode() {
  return getConfig('USE_MOCKS') === 'true';
}

/**
 * Generate mock TikTok video data
 * @param {number} count - Number of mock videos to generate
 * @param {Object} plan - The collection plan (for context)
 * @returns {Object[]} Array of mock video objects
 */
function generateMockTikTokVideos(count, plan) {
  const videos = [];
  const keywords = plan.keywords || ['trend', 'viral', 'popular'];
  const hashtags = plan.hashtags || ['fyp', 'trending'];

  for (let i = 0; i < count; i++) {
    const videoId = `mock_tt_${Date.now()}_${i}`;
    const createTime = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 7 * 24 * 60 * 60);

    videos.push({
      id: videoId,
      username: `mock_creator_${i % 10}`,
      create_time: createTime,
      video_description: `Mock TikTok video about ${keywords[i % keywords.length]} #${hashtags[i % hashtags.length]}`,
      region_code: plan.regionCode || 'US',
      music_id: `music_${Math.floor(Math.random() * 1000000)}`,
      like_count: Math.floor(Math.random() * 100000),
      comment_count: Math.floor(Math.random() * 5000),
      share_count: Math.floor(Math.random() * 10000),
      view_count: Math.floor(Math.random() * 1000000),
      favorites_count: Math.floor(Math.random() * 50000),
      video_duration: Math.floor(Math.random() * 60) + 10,
      hashtag_names: hashtags.slice(0, 3),
      effect_ids: [],
      is_stem_verified: Math.random() > 0.9,
      voice_to_text: '',
      hashtag_info_list: hashtags.map(h => ({ hashtag_name: h })),
      sticker_info_list: [],
      effect_info_list: [],
      video_mention_list: []
    });
  }

  return videos;
}

/**
 * Generate mock Instagram media data
 * @param {number} count - Number of mock media to generate
 * @param {Object} plan - The collection plan (for context)
 * @returns {Object[]} Array of mock media objects
 */
function generateMockInstagramMedia(count, plan) {
  const media = [];
  const keywords = plan.keywords || ['lifestyle', 'beauty', 'fashion'];
  const hashtags = plan.hashtags || ['instagood', 'photooftheday'];

  for (let i = 0; i < count; i++) {
    const mediaId = `mock_ig_${Date.now()}_${i}`;
    const timestamp = new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString();
    const shortcode = `MOCK${Utilities.getUuid().substring(0, 8)}`;

    media.push({
      id: mediaId,
      username: `mock_iguser_${i % 10}`,
      timestamp: timestamp,
      caption: `Mock Instagram post about ${keywords[i % keywords.length]} #${hashtags.join(' #')}`,
      permalink: `https://www.instagram.com/p/${shortcode}/`,
      like_count: Math.floor(Math.random() * 50000),
      comments_count: Math.floor(Math.random() * 1000),
      media_type: Math.random() > 0.3 ? 'VIDEO' : 'IMAGE',
      media_url: 'https://example.com/mock-media.jpg',
      thumbnail_url: 'https://example.com/mock-thumb.jpg',
      shortcode: shortcode,
      media_product_type: Math.random() > 0.5 ? 'REELS' : 'FEED',
      is_comment_enabled: true,
      is_shared_to_feed: true
    });
  }

  return media;
}

/**
 * Mock TikTok Research API query
 * @param {Object} params - Query parameters
 * @returns {Object} Mock API response
 */
function mockTikTokResearchQuery(params) {
  if (!isMockMode()) {
    throw new Error('Mock mode not enabled');
  }

  const count = params.maxCount || 20;
  const plan = params.plan || { keywords: [], hashtags: [] };

  const videos = generateMockTikTokVideos(count, plan);

  return {
    videos: videos,
    cursor: videos.length >= count ? null : `mock_cursor_${Date.now()}`,
    searchId: `mock_search_${Date.now()}`,
    hasMore: videos.length >= count
  };
}

/**
 * Mock Instagram hashtag search
 * @param {string} hashtagName - Hashtag to search
 * @returns {string} Mock hashtag ID
 */
function mockInstagramHashtagSearch(hashtagName) {
  if (!isMockMode()) {
    throw new Error('Mock mode not enabled');
  }

  return `mock_hashtag_${hashtagName}_${Date.now()}`;
}

/**
 * Mock Instagram recent media fetch
 * @param {string} hashtagId - Hashtag ID
 * @param {number} limit - Maximum results
 * @param {Object} plan - Collection plan
 * @returns {Object} Mock API response
 */
function mockInstagramRecentMedia(hashtagId, limit, plan) {
  if (!isMockMode()) {
    throw new Error('Mock mode not enabled');
  }

  const media = generateMockInstagramMedia(limit, plan || {});

  return {
    media: media,
    cursor: media.length >= limit ? `mock_cursor_${Date.now()}` : null,
    hasMore: media.length >= limit
  };
}

/**
 * Create mock Drive artifacts
 * @param {string} platformFolderId - Platform folder ID
 * @param {string} postId - Post ID
 * @param {Object} postData - Post data
 * @param {Object} rawApiResponse - Raw API response
 * @param {string} platform - Platform name
 * @returns {Object} Mock artifact result
 */
function mockCreatePostArtifacts(platformFolderId, postId, postData, rawApiResponse, platform) {
  if (!isMockMode()) {
    // If not in mock mode, use real function
    return createPostArtifacts(platformFolderId, postId, postData, rawApiResponse, platform);
  }

  // Return mock result
  return {
    driveUrl: `https://drive.google.com/mock/${platform}/${postId}`,
    postFolderId: `mock_folder_${postId}`,
    postFolderUrl: `https://drive.google.com/mock/folder/${postId}`,
    memo: 'MOCK: Artifacts not actually created'
  };
}

/**
 * Wrapper for TikTok collection that uses mocks when enabled
 * @param {string} runId - Run ID
 * @param {Object} plan - Collection plan
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection result
 */
function collectTikTokWithMocks(runId, plan, onProgress) {
  if (!isMockMode()) {
    return collectTikTokVideos(runId, plan, onProgress);
  }

  console.log('MOCK MODE: Simulating TikTok collection');

  const state = loadRunState(runId);
  const targetCount = plan.targetCounts.tiktok || 0;

  if (targetCount === 0) {
    return { collected: 0, skipped: 0 };
  }

  const mockVideos = generateMockTikTokVideos(targetCount, plan);
  const postsToWrite = [];

  for (const video of mockVideos) {
    const videoId = String(video.id);

    if (isPostProcessed(runId, 'tiktok', videoId)) {
      continue;
    }

    const artifactResult = mockCreatePostArtifacts(
      state.tiktokFolderId,
      videoId,
      { create_username: video.username },
      video,
      'tiktok'
    );

    const normalizedPost = normalizeTikTokPost(video, artifactResult.driveUrl, 'MOCK DATA');
    postsToWrite.push(normalizedPost);
    addProcessedPostId(runId, 'tiktok', videoId);
  }

  // Write to spreadsheet
  appendRowsBatch(state.spreadsheetId, 'tiktok', postsToWrite);
  updateTikTokProgress(runId, { collected: postsToWrite.length });

  if (onProgress) {
    onProgress({ platform: 'tiktok', collected: postsToWrite.length, target: targetCount });
  }

  return { collected: postsToWrite.length, skipped: 0 };
}

/**
 * Wrapper for Instagram collection that uses mocks when enabled
 * @param {string} runId - Run ID
 * @param {Object} plan - Collection plan
 * @param {function} onProgress - Progress callback
 * @returns {Object} Collection result
 */
function collectInstagramWithMocks(runId, plan, onProgress) {
  if (!isMockMode()) {
    return collectInstagramMedia(runId, plan, onProgress);
  }

  console.log('MOCK MODE: Simulating Instagram collection');

  const state = loadRunState(runId);
  const targetCount = plan.targetCounts.instagram || 0;

  if (targetCount === 0) {
    return { collected: 0, skipped: 0 };
  }

  const mockMedia = generateMockInstagramMedia(targetCount, plan);
  const postsToWrite = [];

  for (const media of mockMedia) {
    const mediaId = String(media.id);

    if (isPostProcessed(runId, 'instagram', mediaId)) {
      continue;
    }

    const artifactResult = mockCreatePostArtifacts(
      state.instagramFolderId,
      mediaId,
      {
        media_url: media.media_url,
        media_type: media.media_type,
        post_url: media.permalink,
        shortcode: media.shortcode,
        create_username: media.username
      },
      media,
      'instagram'
    );

    const normalizedPost = normalizeInstagramPost(media, artifactResult.driveUrl, 'MOCK DATA');
    postsToWrite.push(normalizedPost);
    addProcessedPostId(runId, 'instagram', mediaId);
  }

  // Write to spreadsheet
  appendRowsBatch(state.spreadsheetId, 'instagram', postsToWrite);
  updateInstagramProgress(runId, { collected: postsToWrite.length });

  if (onProgress) {
    onProgress({ platform: 'instagram', collected: postsToWrite.length, target: targetCount });
  }

  return { collected: postsToWrite.length, skipped: 0 };
}

/**
 * Enable mock mode
 */
function enableMockMode() {
  setConfig('USE_MOCKS', 'true');
  console.log('Mock mode enabled');
}

/**
 * Disable mock mode
 */
function disableMockMode() {
  setConfig('USE_MOCKS', 'false');
  console.log('Mock mode disabled');
}

/**
 * Run a test with mock data
 * @returns {Object} Test result
 */
function runMockTest() {
  enableMockMode();

  try {
    const result = startRun('TEST: Collect 10 posts about mock testing');
    console.log('Mock test started:', result.runId);
    console.log('Spreadsheet:', result.spreadsheetUrl);

    return {
      success: true,
      runId: result.runId,
      spreadsheetUrl: result.spreadsheetUrl
    };

  } catch (e) {
    console.error('Mock test failed:', e);
    return { success: false, error: e.message };

  } finally {
    // Keep mock mode enabled for the continuation triggers
    // disableMockMode();
  }
}
