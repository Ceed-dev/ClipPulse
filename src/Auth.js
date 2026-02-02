/**
 * Auth.js
 * Authentication flows for TikTok and Meta (Instagram) APIs
 *
 * TikTok Research API uses client credentials (2-legged OAuth)
 * Meta/Instagram uses 3-legged OAuth via the Apps Script OAuth2 library
 *
 * Specification section 5.5 and Phase 3
 */

// ============================================================
// TikTok Research API Authentication (Client Credentials)
// ============================================================

/**
 * Get TikTok Research API access token
 * Uses client credentials flow (no user interaction required)
 * @returns {string|null} The access token or null if not configured
 */
function getTikTokResearchAccessToken() {
  if (!isTikTokResearchConfigured()) {
    console.log('TikTok Research API not configured');
    return null;
  }

  // Check if we have a valid cached token
  const cachedToken = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_ACCESS_TOKEN);
  const expiresAt = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_TOKEN_EXPIRES_AT);

  if (cachedToken && expiresAt) {
    const expiresAtDate = new Date(expiresAt);
    const now = new Date();
    // Refresh if less than 5 minutes until expiry
    if (expiresAtDate.getTime() - now.getTime() > 5 * 60 * 1000) {
      return cachedToken;
    }
  }

  // Fetch new token
  return refreshTikTokResearchToken();
}

/**
 * Refresh TikTok Research API access token
 * @returns {string|null} The new access token or null on failure
 */
function refreshTikTokResearchToken() {
  const clientKey = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_CLIENT_KEY);
  const clientSecret = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_CLIENT_SECRET);

  if (!clientKey || !clientSecret) {
    console.error('TikTok Research API credentials not configured');
    return null;
  }

  try {
    const response = UrlFetchApp.fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: {
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      },
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());

    if (responseCode !== 200) {
      console.error('TikTok token request failed:', responseBody);
      return null;
    }

    const accessToken = responseBody.access_token;
    const expiresIn = responseBody.expires_in || 7200; // Default 2 hours

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Cache the token
    setConfig(CONFIG_KEYS.TIKTOK_RESEARCH_ACCESS_TOKEN, accessToken);
    setConfig(CONFIG_KEYS.TIKTOK_RESEARCH_TOKEN_EXPIRES_AT, expiresAt);

    console.log('TikTok Research token refreshed, expires at:', expiresAt);
    return accessToken;

  } catch (e) {
    console.error('Error refreshing TikTok Research token:', e);
    return null;
  }
}

/**
 * Invalidate cached TikTok Research token
 */
function invalidateTikTokResearchToken() {
  deleteConfig(CONFIG_KEYS.TIKTOK_RESEARCH_ACCESS_TOKEN);
  deleteConfig(CONFIG_KEYS.TIKTOK_RESEARCH_TOKEN_EXPIRES_AT);
}

// ============================================================
// Meta (Instagram) OAuth Authentication
// Uses googleworkspace/apps-script-oauth2 library
// ============================================================

/**
 * Get the OAuth callback URL for this script
 * This URL must be registered in Facebook Developer Console
 *
 * IMPORTANT: The OAuth2 library ALWAYS uses this format:
 * https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
 *
 * This is true even for Google Workspace accounts!
 * The /a/macros/{DOMAIN}/ format is for Web App URLs, NOT for OAuth callbacks.
 *
 * @returns {string} The callback URL that OAuth2 library will use
 */
function getOAuthCallbackUrl() {
  // The OAuth2 library ALWAYS uses this format, regardless of account type:
  // https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
  const scriptId = ScriptApp.getScriptId();
  return `https://script.google.com/macros/d/${scriptId}/usercallback`;
}

/**
 * Debug function to display the exact callback URL that must be registered
 * Run this from the script editor to get the correct URL for Facebook Developer Console
 *
 * IMPORTANT: After running this function, copy the URL and register it in:
 * Facebook Developer Console > Your App > Use Cases > Facebook Login > Settings > Valid OAuth Redirect URIs
 */
function showOAuthCallbackUrl() {
  const scriptId = ScriptApp.getScriptId();
  const callbackUrl = getOAuthCallbackUrl();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     OAUTH CALLBACK URL FOR FACEBOOK                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Register this EXACT URL in Facebook Developer Console:');
  console.log('');
  console.log('   ' + callbackUrl);
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────────────────────');
  console.log('📍 Where to register:');
  console.log('   1. Go to https://developers.facebook.com/apps/');
  console.log('   2. Select your app');
  console.log('   3. Go to: Use Cases > Facebook Login > Settings');
  console.log('   4. Find: "Valid OAuth Redirect URIs"');
  console.log('   5. Add the URL above (remove any old URLs that don\'t match!)');
  console.log('   6. Click "Save Changes"');
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────────────────────');
  console.log('ℹ️  Script ID: ' + scriptId);
  console.log('');
  console.log('⚠️  IMPORTANT: The OAuth2 library ALWAYS uses this format:');
  console.log('   https://script.google.com/macros/d/{SCRIPT_ID}/usercallback');
  console.log('');
  console.log('   This is true even for Google Workspace accounts!');
  console.log('   Do NOT use the /a/macros/{DOMAIN}/ format - that is for Web App URLs only.');
  console.log('');

  return callbackUrl;
}

/**
 * Create the OAuth2 service for Meta/Instagram
 * @returns {OAuth2.Service} The OAuth2 service
 */
function getMetaOAuthService() {
  const appId = getConfig(CONFIG_KEYS.META_APP_ID);
  const appSecret = getConfig(CONFIG_KEYS.META_APP_SECRET);

  if (!appId || !appSecret) {
    throw new Error('Meta App credentials not configured');
  }

  // NOTE: Do NOT manually set redirect_uri here!
  // The OAuth2 library automatically constructs the callback URL
  // based on the script ID and deployment type.
  // Setting it manually can cause URL mismatch errors.

  return OAuth2.createService('meta')
    .setAuthorizationBaseUrl('https://www.facebook.com/v18.0/dialog/oauth')
    .setTokenUrl('https://graph.facebook.com/v18.0/oauth/access_token')
    .setClientId(appId)
    .setClientSecret(appSecret)
    .setCallbackFunction('authCallbackMeta')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope([
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management'
    ].join(','))
    .setParam('response_type', 'code');
    // redirect_uri is automatically set by OAuth2 library - do not override!
}

/**
 * Get the authorization URL for Meta OAuth
 * @returns {string} The authorization URL
 */
function getMetaAuthorizationUrl() {
  const service = getMetaOAuthService();
  return service.getAuthorizationUrl();
}

/**
 * OAuth callback handler for Meta
 * @param {Object} request - The callback request
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML response
 */
function authCallbackMeta(request) {
  const service = getMetaOAuthService();
  const authorized = service.handleCallback(request);

  if (authorized) {
    // After authorization, get and store the Instagram user ID
    try {
      exchangeForLongLivedToken();
      resolveInstagramUserId();
      return HtmlService.createHtmlOutput(
        '<h2>Success!</h2><p>Instagram authorization complete. You can close this window.</p>'
      );
    } catch (e) {
      return HtmlService.createHtmlOutput(
        '<h2>Partial Success</h2><p>Authorized but failed to get Instagram user ID: ' + e.message + '</p>'
      );
    }
  } else {
    return HtmlService.createHtmlOutput(
      '<h2>Authorization Failed</h2><p>Please try again.</p>'
    );
  }
}

/**
 * Exchange short-lived token for long-lived token
 * Long-lived tokens last ~60 days
 */
function exchangeForLongLivedToken() {
  const service = getMetaOAuthService();
  const shortLivedToken = service.getAccessToken();
  const appId = getConfig(CONFIG_KEYS.META_APP_ID);
  const appSecret = getConfig(CONFIG_KEYS.META_APP_SECRET);

  const response = UrlFetchApp.fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `fb_exchange_token=${shortLivedToken}`,
    { muteHttpExceptions: true }
  );

  const data = JSON.parse(response.getContentText());

  if (data.access_token) {
    // Store the long-lived token
    const props = PropertiesService.getUserProperties();
    const tokenData = {
      access_token: data.access_token,
      token_type: 'bearer',
      expires_in: data.expires_in || 5184000 // ~60 days
    };
    props.setProperty('oauth2.meta', JSON.stringify(tokenData));
    console.log('Exchanged for long-lived token');
  }
}

/**
 * Get Meta/Instagram access token
 * @returns {string|null} The access token or null if not authorized
 */
function getMetaAccessToken() {
  const service = getMetaOAuthService();

  if (!service.hasAccess()) {
    console.log('Meta OAuth: Not authorized');
    return null;
  }

  return service.getAccessToken();
}

/**
 * Check if Meta/Instagram is authorized
 * @returns {boolean}
 */
function isMetaAuthorized() {
  try {
    const service = getMetaOAuthService();
    return service.hasAccess();
  } catch (e) {
    return false;
  }
}

/**
 * Reset Meta OAuth authorization
 */
function resetMetaAuth() {
  const service = getMetaOAuthService();
  service.reset();
  deleteConfig(CONFIG_KEYS.IG_DEFAULT_PAGE_ID);
  deleteConfig(CONFIG_KEYS.IG_DEFAULT_IG_USER_ID);
}

/**
 * Resolve and store the Instagram User ID
 * This is needed for making Instagram Graph API calls
 */
function resolveInstagramUserId() {
  const token = getMetaAccessToken();
  if (!token) {
    throw new Error('Not authorized with Meta');
  }

  // Get pages the user has access to
  const pagesResponse = UrlFetchApp.fetch(
    `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}`,
    { muteHttpExceptions: true }
  );

  const pagesData = JSON.parse(pagesResponse.getContentText());

  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error('No Facebook Pages found. Please connect a Facebook Page to your Instagram Professional account.');
  }

  // Use the first page (or you could let user select)
  const page = pagesData.data[0];
  const pageId = page.id;
  const pageAccessToken = page.access_token;

  // Get the Instagram Business Account connected to this page
  const igResponse = UrlFetchApp.fetch(
    `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`,
    { muteHttpExceptions: true }
  );

  const igData = JSON.parse(igResponse.getContentText());

  if (!igData.instagram_business_account) {
    throw new Error('No Instagram Business Account connected to this Facebook Page.');
  }

  const igUserId = igData.instagram_business_account.id;

  // Store the IDs
  setConfig(CONFIG_KEYS.IG_DEFAULT_PAGE_ID, pageId);
  setConfig(CONFIG_KEYS.IG_DEFAULT_IG_USER_ID, igUserId);

  console.log('Instagram User ID resolved:', igUserId);
  return igUserId;
}

/**
 * Get the Instagram User ID (for API calls)
 * @returns {string|null}
 */
function getInstagramUserId() {
  return getConfig(CONFIG_KEYS.IG_DEFAULT_IG_USER_ID);
}

/**
 * Get the Graph API version to use
 * @returns {string}
 */
function getGraphApiVersion() {
  return getConfig(CONFIG_KEYS.META_GRAPH_API_VERSION, CONFIG_DEFAULTS.META_GRAPH_API_VERSION);
}

// ============================================================
// TikTok Display API OAuth (Optional Fallback)
// ============================================================

/**
 * Create the OAuth2 service for TikTok Display API
 * This is the optional fallback when Research API is not available
 * @returns {OAuth2.Service} The OAuth2 service
 */
function getTikTokDisplayOAuthService() {
  const clientKey = getConfig(CONFIG_KEYS.TIKTOK_DISPLAY_CLIENT_KEY);
  const clientSecret = getConfig(CONFIG_KEYS.TIKTOK_DISPLAY_CLIENT_SECRET);

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok Display API credentials not configured');
  }

  return OAuth2.createService('tiktok_display')
    .setAuthorizationBaseUrl('https://www.tiktok.com/v2/auth/authorize/')
    .setTokenUrl('https://open.tiktokapis.com/v2/oauth/token/')
    .setClientId(clientKey)
    .setClientSecret(clientSecret)
    .setCallbackFunction('authCallbackTikTokDisplay')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('user.info.basic,video.list')
    .setTokenHeaders({
      'Content-Type': 'application/x-www-form-urlencoded'
    });
}

/**
 * Get the authorization URL for TikTok Display API
 * @returns {string}
 */
function getTikTokDisplayAuthorizationUrl() {
  const service = getTikTokDisplayOAuthService();
  return service.getAuthorizationUrl();
}

/**
 * OAuth callback handler for TikTok Display API
 * @param {Object} request - The callback request
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function authCallbackTikTokDisplay(request) {
  const service = getTikTokDisplayOAuthService();
  const authorized = service.handleCallback(request);

  if (authorized) {
    return HtmlService.createHtmlOutput(
      '<h2>Success!</h2><p>TikTok Display API authorization complete. You can close this window.</p>'
    );
  } else {
    return HtmlService.createHtmlOutput(
      '<h2>Authorization Failed</h2><p>Please try again.</p>'
    );
  }
}

/**
 * Get TikTok Display API access token
 * @returns {string|null}
 */
function getTikTokDisplayAccessToken() {
  if (!isTikTokDisplayConfigured()) {
    return null;
  }

  try {
    const service = getTikTokDisplayOAuthService();
    if (!service.hasAccess()) {
      return null;
    }
    return service.getAccessToken();
  } catch (e) {
    return null;
  }
}

/**
 * Check if TikTok Display API is authorized
 * @returns {boolean}
 */
function isTikTokDisplayAuthorized() {
  try {
    const service = getTikTokDisplayOAuthService();
    return service.hasAccess();
  } catch (e) {
    return false;
  }
}

/**
 * Reset TikTok Display OAuth authorization
 */
function resetTikTokDisplayAuth() {
  try {
    const service = getTikTokDisplayOAuthService();
    service.reset();
  } catch (e) {
    // Ignore if not configured
  }
}

// ============================================================
// Helper Functions for Setup
// ============================================================

/**
 * Get the auth status for all services
 * @returns {Object} Status of each auth service
 */
function getAuthStatus() {
  return {
    tiktokResearch: {
      configured: isTikTokResearchConfigured(),
      hasToken: !!getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_ACCESS_TOKEN)
    },
    tiktokDisplay: {
      configured: isTikTokDisplayConfigured(),
      authorized: isTikTokDisplayAuthorized()
    },
    instagram: {
      configured: isInstagramConfigured(),
      authorized: isMetaAuthorized(),
      userId: getInstagramUserId()
    }
  };
}

/**
 * Log auth URLs for manual OAuth setup
 * Run this function from the script editor to get OAuth URLs
 */
function logAuthUrls() {
  console.log('=== OAuth Authorization URLs ===\n');

  // First, show the callback URL that must be registered
  console.log('【重要】Facebook Developer Console に登録すべき Callback URL:');
  try {
    const callbackUrl = getOAuthCallbackUrl();
    console.log(callbackUrl);
    console.log('');
    console.log('※ このURLが Facebook Developer > 製品 > Facebookログイン > 設定 > 有効なOAuthリダイレクトURI に登録されていることを確認してください。');
    console.log('');
  } catch (e) {
    console.log('Callback URL取得エラー:', e.message);
    console.log('※ Web Appとしてデプロイされていない可能性があります。');
    console.log('');
  }

  if (isInstagramConfigured() || (getConfig(CONFIG_KEYS.META_APP_ID) && getConfig(CONFIG_KEYS.META_APP_SECRET))) {
    try {
      console.log('Meta/Instagram OAuth URL:');
      console.log(getMetaAuthorizationUrl());
      console.log('');
    } catch (e) {
      console.log('Meta OAuth error:', e.message);
    }
  }

  if (isTikTokDisplayConfigured()) {
    try {
      console.log('TikTok Display OAuth URL:');
      console.log(getTikTokDisplayAuthorizationUrl());
      console.log('');
    } catch (e) {
      console.log('TikTok Display OAuth error:', e.message);
    }
  }

  console.log('TikTok Research API uses client credentials (no OAuth URL needed)');
}
