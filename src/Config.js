/**
 * Config.js
 * Configuration management using Script Properties
 *
 * All secrets and configuration keys are stored in Apps Script Script Properties
 * and never exposed in client-side code.
 */

/**
 * Configuration keys as defined in specification section 13
 */
const CONFIG_KEYS = {
  // Minimum required keys
  CLIPPULSE_ROOT_FOLDER_ID: 'CLIPPULSE_ROOT_FOLDER_ID',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  OPENAI_MODEL: 'OPENAI_MODEL',

  // TikTok Research API
  TIKTOK_RESEARCH_CLIENT_KEY: 'TIKTOK_RESEARCH_CLIENT_KEY',
  TIKTOK_RESEARCH_CLIENT_SECRET: 'TIKTOK_RESEARCH_CLIENT_SECRET',
  TIKTOK_RESEARCH_ACCESS_TOKEN: 'TIKTOK_RESEARCH_ACCESS_TOKEN',
  TIKTOK_RESEARCH_TOKEN_EXPIRES_AT: 'TIKTOK_RESEARCH_TOKEN_EXPIRES_AT',

  // TikTok Display API (optional)
  TIKTOK_DISPLAY_CLIENT_KEY: 'TIKTOK_DISPLAY_CLIENT_KEY',
  TIKTOK_DISPLAY_CLIENT_SECRET: 'TIKTOK_DISPLAY_CLIENT_SECRET',

  // Instagram / Meta
  META_APP_ID: 'META_APP_ID',
  META_APP_SECRET: 'META_APP_SECRET',
  META_GRAPH_API_VERSION: 'META_GRAPH_API_VERSION',
  IG_DEFAULT_PAGE_ID: 'IG_DEFAULT_PAGE_ID',
  IG_DEFAULT_IG_USER_ID: 'IG_DEFAULT_IG_USER_ID',

  // Operational
  MAX_POSTS_PER_PLATFORM_DEFAULT: 'MAX_POSTS_PER_PLATFORM_DEFAULT',
  BATCH_SIZE: 'BATCH_SIZE',
  MAX_RETRIES: 'MAX_RETRIES',
  RETRY_BACKOFF_MS: 'RETRY_BACKOFF_MS'
};

/**
 * Default values for operational configuration
 */
const CONFIG_DEFAULTS = {
  OPENAI_MODEL: 'gpt-5.2-pro',
  META_GRAPH_API_VERSION: 'v18.0',
  MAX_POSTS_PER_PLATFORM_DEFAULT: 30,
  BATCH_SIZE: 15,
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000
};

/**
 * Get a configuration value from Script Properties
 * @param {string} key - The configuration key
 * @param {*} defaultValue - Default value if not set
 * @returns {string|null} The configuration value
 */
function getConfig(key, defaultValue = null) {
  const props = PropertiesService.getScriptProperties();
  const value = props.getProperty(key);

  if (value === null && defaultValue !== null) {
    return defaultValue;
  }

  return value;
}

/**
 * Set a configuration value in Script Properties
 * @param {string} key - The configuration key
 * @param {string} value - The value to set
 */
function setConfig(key, value) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, String(value));
}

/**
 * Delete a configuration value from Script Properties
 * @param {string} key - The configuration key to delete
 */
function deleteConfig(key) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(key);
}

/**
 * Get all configuration values (for debugging - be careful with secrets)
 * @returns {Object} All configuration key-value pairs
 */
function getAllConfig() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperties();
}

/**
 * Initialize default configuration values if not set
 */
function initializeDefaults() {
  const props = PropertiesService.getScriptProperties();

  Object.entries(CONFIG_DEFAULTS).forEach(([key, defaultValue]) => {
    if (props.getProperty(key) === null) {
      props.setProperty(key, String(defaultValue));
    }
  });
}

/**
 * Validate that all required configuration keys are set
 * @returns {Object} Validation result with isValid and missingKeys
 */
function validateConfig() {
  const requiredKeys = [
    CONFIG_KEYS.CLIPPULSE_ROOT_FOLDER_ID,
    CONFIG_KEYS.OPENAI_API_KEY
  ];

  const props = PropertiesService.getScriptProperties();
  const missingKeys = requiredKeys.filter(key => !props.getProperty(key));

  return {
    isValid: missingKeys.length === 0,
    missingKeys: missingKeys
  };
}

/**
 * Check if TikTok Research API is configured
 * @returns {boolean}
 */
function isTikTokResearchConfigured() {
  const clientKey = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_CLIENT_KEY);
  const clientSecret = getConfig(CONFIG_KEYS.TIKTOK_RESEARCH_CLIENT_SECRET);
  return !!(clientKey && clientSecret);
}

/**
 * Check if TikTok Display API is configured (fallback)
 * @returns {boolean}
 */
function isTikTokDisplayConfigured() {
  const clientKey = getConfig(CONFIG_KEYS.TIKTOK_DISPLAY_CLIENT_KEY);
  const clientSecret = getConfig(CONFIG_KEYS.TIKTOK_DISPLAY_CLIENT_SECRET);
  return !!(clientKey && clientSecret);
}

/**
 * Check if Instagram/Meta API is configured
 * @returns {boolean}
 */
function isInstagramConfigured() {
  const appId = getConfig(CONFIG_KEYS.META_APP_ID);
  const appSecret = getConfig(CONFIG_KEYS.META_APP_SECRET);
  const igUserId = getConfig(CONFIG_KEYS.IG_DEFAULT_IG_USER_ID);
  return !!(appId && appSecret && igUserId);
}

/**
 * Get operational configuration with defaults
 * @returns {Object} Operational configuration
 */
function getOperationalConfig() {
  return {
    maxPostsPerPlatform: parseInt(getConfig(CONFIG_KEYS.MAX_POSTS_PER_PLATFORM_DEFAULT, CONFIG_DEFAULTS.MAX_POSTS_PER_PLATFORM_DEFAULT)),
    batchSize: parseInt(getConfig(CONFIG_KEYS.BATCH_SIZE, CONFIG_DEFAULTS.BATCH_SIZE)),
    maxRetries: parseInt(getConfig(CONFIG_KEYS.MAX_RETRIES, CONFIG_DEFAULTS.MAX_RETRIES)),
    retryBackoffMs: parseInt(getConfig(CONFIG_KEYS.RETRY_BACKOFF_MS, CONFIG_DEFAULTS.RETRY_BACKOFF_MS))
  };
}
