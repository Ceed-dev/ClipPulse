/**
 * InstagramRapidAPI.js
 * Third-party Instagram data collection using RapidAPI
 *
 * This module provides alternative data collection when official Instagram Graph API
 * doesn't return needed fields (e.g., media_url, username for hashtag search results).
 *
 * Supported RapidAPI providers:
 * - Instagram API – Fast & Reliable Data Scraper (default)
 * - Configurable via INSTAGRAM_RAPIDAPI_HOST
 *
 * Configuration required:
 * - INSTAGRAM_RAPIDAPI_KEY: Your RapidAPI API key
 * - INSTAGRAM_RAPIDAPI_HOST: API host (optional, has default)
 */

/**
 * Default RapidAPI host for Instagram
 */
const DEFAULT_INSTAGRAM_RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';

/**
 * Get the RapidAPI host for Instagram
 * @returns {string} The API host
 */
function getInstagramRapidAPIHost() {
  return getConfig(CONFIG_KEYS.INSTAGRAM_RAPIDAPI_HOST) || DEFAULT_INSTAGRAM_RAPIDAPI_HOST;
}

/**
 * Check if Instagram RapidAPI is configured
 * @returns {boolean}
 */
function isInstagramRapidAPIConfigured() {
  const apiKey = getConfig(CONFIG_KEYS.INSTAGRAM_RAPIDAPI_KEY);
  const isConfigured = !!apiKey;
  console.log(`[DEBUG] isInstagramRapidAPIConfigured: apiKey=${apiKey ? 'SET' : 'NOT SET'}, result=${isConfigured}`);
  return isConfigured;
}

/**
 * Make a request to Instagram RapidAPI
 * @param {string} endpoint - API endpoint path
 * @param {Object} params - Query parameters
 * @returns {Object} API response
 */
function callInstagramRapidAPI(endpoint, params = {}) {
  const apiKey = getConfig(CONFIG_KEYS.INSTAGRAM_RAPIDAPI_KEY);
  if (!apiKey) {
    throw new Error('Instagram RapidAPI key not configured');
  }

  const host = getInstagramRapidAPIHost();
  const baseUrl = `https://${host}`;

  // Build query string
  const queryParams = Object.entries(params)
    .filter(([key, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  const url = queryParams ? `${baseUrl}${endpoint}?${queryParams}` : `${baseUrl}${endpoint}`;

  console.log(`[DEBUG] Calling Instagram RapidAPI: ${url}`);

  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': host
    },
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    console.error(`Instagram RapidAPI error (${responseCode}):`, responseText);
    throw new Error(`Instagram RapidAPI error: ${responseCode} - ${responseText.substring(0, 200)}`);
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse RapidAPI response:', responseText.substring(0, 500));
    throw new Error('Invalid JSON response from Instagram RapidAPI');
  }
}

/**
 * Get posts by hashtag using RapidAPI
 * @param {string} hashtag - Hashtag to search (without #)
 * @param {number} [limit] - Maximum number of posts
 * @returns {Object} Posts data
 */
function getHashtagPostsViaRapidAPI(hashtag, limit = 50) {
  // Try different endpoint patterns based on common RapidAPI Instagram API structures
  // Pattern 1: /v1/hashtag - Instagram Scraper API2
  try {
    console.log(`[DEBUG] Trying RapidAPI hashtag endpoint for: ${hashtag}`);

    const response = callInstagramRapidAPI('/v1/hashtag', {
      hashtag: hashtag
    });

    if (response && response.data) {
      return {
        posts: normalizeRapidAPIPosts(response.data.medias || response.data.posts || response.data, hashtag),
        hasMore: !!response.data.next_max_id,
        cursor: response.data.next_max_id || null
      };
    }

    return { posts: [], hasMore: false, cursor: null };

  } catch (e) {
    console.log(`[DEBUG] RapidAPI hashtag request failed: ${e.message}`);
    throw e;
  }
}

/**
 * Get post details by shortcode using RapidAPI
 * @param {string} shortcode - Instagram post shortcode
 * @returns {Object|null} Post details or null
 */
function getPostDetailsByShortcode(shortcode) {
  try {
    console.log(`[DEBUG] Getting post details for shortcode: ${shortcode}`);

    const response = callInstagramRapidAPI('/v1/post_info', {
      code_or_id_or_url: shortcode
    });

    if (response && response.data) {
      return normalizeRapidAPIPost(response.data, '');
    }

    return null;

  } catch (e) {
    console.log(`[DEBUG] Failed to get post details for ${shortcode}: ${e.message}`);
    return null;
  }
}

/**
 * Normalize posts from RapidAPI response to match our schema
 * @param {Array} posts - Raw posts from RapidAPI
 * @param {string} hashtag - The hashtag used for search
 * @returns {Array} Normalized posts
 */
function normalizeRapidAPIPosts(posts, hashtag) {
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.map(post => normalizeRapidAPIPost(post, hashtag));
}

/**
 * Normalize a single post from RapidAPI response
 * Handles various response formats from different RapidAPI providers
 * @param {Object} post - Raw post from RapidAPI
 * @param {string} hashtag - The hashtag used for search
 * @returns {Object} Normalized post data
 */
function normalizeRapidAPIPost(post, hashtag) {
  // Handle various field naming conventions from different RapidAPI providers
  const id = post.id || post.pk || post.media_id || '';
  const shortcode = post.shortcode || post.code || extractShortcodeFromUrl(post.permalink || post.link || '');

  // Username extraction
  const username = post.username ||
    post.user?.username ||
    post.owner?.username ||
    post.owner_username ||
    '';

  // Media URL extraction
  const mediaUrl = post.video_url ||
    post.media_url ||
    post.display_url ||
    post.image_versions2?.candidates?.[0]?.url ||
    post.carousel_media?.[0]?.video_url ||
    post.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    '';

  // Thumbnail URL extraction
  const thumbnailUrl = post.thumbnail_url ||
    post.display_url ||
    post.image_versions2?.candidates?.[0]?.url ||
    post.thumbnail_src ||
    '';

  // Caption extraction
  const caption = post.caption?.text ||
    post.caption ||
    post.edge_media_to_caption?.edges?.[0]?.node?.text ||
    post.text ||
    '';

  // Timestamp extraction
  let timestamp = post.taken_at ||
    post.timestamp ||
    post.taken_at_timestamp ||
    post.created_at ||
    '';

  // Convert Unix timestamp to ISO string if needed
  if (typeof timestamp === 'number') {
    timestamp = new Date(timestamp * 1000).toISOString();
  }

  // Media type detection
  let mediaType = post.media_type || post.product_type || '';
  if (!mediaType) {
    if (post.is_video || post.video_url) {
      mediaType = 'VIDEO';
    } else if (post.carousel_media || post.children) {
      mediaType = 'CAROUSEL_ALBUM';
    } else {
      mediaType = 'IMAGE';
    }
  }
  // Normalize media type values
  if (typeof mediaType === 'number') {
    // Instagram uses numeric media types: 1=IMAGE, 2=VIDEO, 8=CAROUSEL
    mediaType = { 1: 'IMAGE', 2: 'VIDEO', 8: 'CAROUSEL_ALBUM' }[mediaType] || 'IMAGE';
  }

  // Permalink construction
  const permalink = post.permalink ||
    post.link ||
    (shortcode ? `https://www.instagram.com/p/${shortcode}/` : '');

  return {
    id: String(id),
    shortcode: shortcode,
    username: username,
    caption: caption,
    media_type: mediaType.toUpperCase(),
    media_url: mediaUrl,
    thumbnail_url: thumbnailUrl,
    permalink: permalink,
    timestamp: timestamp,
    like_count: post.like_count ?? post.likes?.count ?? post.edge_liked_by?.count ?? '',
    comments_count: post.comment_count ?? post.comments?.count ?? post.edge_media_to_comment?.count ?? '',
    media_product_type: post.product_type || '',
    is_comment_enabled: post.comments_disabled === false,
    is_shared_to_feed: post.is_shared_to_feed ?? true,
    children: post.carousel_media || post.children || [],
    hashtag: hashtag,
    _source: 'rapidapi'
  };
}

/**
 * Extract shortcode from Instagram URL
 * @param {string} url - Instagram URL
 * @returns {string} Shortcode or empty string
 */
function extractShortcodeFromUrl(url) {
  if (!url) return '';
  const match = url.match(/\/(?:p|reel)\/([^\/]+)/);
  return match ? match[1] : '';
}

/**
 * Enrich hashtag search results with RapidAPI data
 * Takes posts from official Instagram API (limited fields) and enriches them with RapidAPI data
 * @param {Array} officialPosts - Posts from official Instagram Graph API
 * @param {string} hashtag - The hashtag used for search
 * @returns {Array} Enriched posts
 */
function enrichPostsWithRapidAPI(officialPosts, hashtag) {
  if (!isInstagramRapidAPIConfigured()) {
    console.log('[DEBUG] RapidAPI not configured, returning original posts');
    return officialPosts;
  }

  const enrichedPosts = [];

  for (const post of officialPosts) {
    try {
      // Extract shortcode from official post
      let shortcode = post.shortcode;
      if (!shortcode && post.permalink) {
        const match = post.permalink.match(/\/(?:p|reel)\/([^\/]+)/);
        if (match) shortcode = match[1];
      }

      if (!shortcode) {
        // Can't enrich without shortcode, use original
        enrichedPosts.push(post);
        continue;
      }

      // Get detailed post info from RapidAPI
      const detailedPost = getPostDetailsByShortcode(shortcode);

      if (detailedPost) {
        // Merge official data with RapidAPI data
        // Official data takes precedence for fields it provides
        const enriched = {
          ...detailedPost,
          ...post, // Official data overwrites where available
          // But use RapidAPI data for fields official API doesn't provide
          username: post.username || detailedPost.username,
          media_url: post.media_url || detailedPost.media_url,
          thumbnail_url: post.thumbnail_url || detailedPost.thumbnail_url,
          shortcode: shortcode,
          media_product_type: post.media_product_type || detailedPost.media_product_type,
          is_comment_enabled: post.is_comment_enabled ?? detailedPost.is_comment_enabled,
          is_shared_to_feed: post.is_shared_to_feed ?? detailedPost.is_shared_to_feed,
          children: post.children || detailedPost.children,
          _enriched: true
        };
        enrichedPosts.push(enriched);
      } else {
        enrichedPosts.push(post);
      }

      // Rate limiting - be gentle with RapidAPI
      Utilities.sleep(200);

    } catch (e) {
      console.log(`[DEBUG] Failed to enrich post: ${e.message}`);
      enrichedPosts.push(post);
    }
  }

  return enrichedPosts;
}

/**
 * Test RapidAPI connection
 * @returns {Object} Test result
 */
function testInstagramRapidAPI() {
  try {
    if (!isInstagramRapidAPIConfigured()) {
      return { success: false, message: 'Instagram RapidAPI key not configured' };
    }

    // Try to get posts for a simple hashtag
    const result = getHashtagPostsViaRapidAPI('test', 5);

    return {
      success: true,
      message: 'Instagram RapidAPI connection successful',
      postsFound: result.posts.length,
      host: getInstagramRapidAPIHost()
    };

  } catch (e) {
    return { success: false, message: e.message };
  }
}
