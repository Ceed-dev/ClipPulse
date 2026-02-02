/**
 * StateStore.js
 * Persists run state (status, cursors, progress, created IDs)
 * Supports resume after trigger continuation
 *
 * State is stored in Script Properties with a prefix for each run.
 */

/**
 * Run lifecycle states as defined in specification section 10.1
 */
const RUN_STATUS = {
  CREATED: 'CREATED',
  PLANNING: 'PLANNING',
  RUNNING_INSTAGRAM: 'RUNNING_INSTAGRAM',
  RUNNING_X: 'RUNNING_X',
  RUNNING_TIKTOK: 'RUNNING_TIKTOK',
  FINALIZING: 'FINALIZING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

/**
 * Generate a unique run ID
 * Format: YYYYMMDD_HHMMSS_<8charHash>
 * @returns {string} The generated run ID
 */
function generateRunId() {
  const now = new Date();
  const datePart = Utilities.formatDate(now, 'UTC', 'yyyyMMdd_HHmmss');
  const hash = Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  return `${datePart}_${hash}`;
}

/**
 * Get the storage key for a run's state
 * @param {string} runId - The run ID
 * @returns {string} The storage key
 */
function getRunStateKey(runId) {
  return `RUN_STATE_${runId}`;
}

/**
 * Create initial run state
 * @param {string} runId - The run ID
 * @param {string} instruction - The user's instruction
 * @returns {Object} The initial run state
 */
function createRunState(runId, instruction) {
  return {
    runId: runId,
    instruction: instruction,
    status: RUN_STATUS.CREATED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Plan from LLM
    plan: null,

    // Progress tracking
    instagramProgress: {
      collected: 0,
      target: 0,
      cursor: null,
      processedIds: []
    },
    xProgress: {
      collected: 0,
      target: 0,
      cursor: null,
      processedIds: []
    },
    tiktokProgress: {
      collected: 0,
      target: 0,
      cursor: null,
      searchId: null,
      processedIds: []
    },

    // Created resources
    spreadsheetId: null,
    spreadsheetUrl: null,
    runFolderId: null,
    instagramFolderId: null,
    xFolderId: null,
    tiktokFolderId: null,

    // Error tracking
    lastError: null,
    lastMessage: null,

    // Batch processing
    currentBatch: 0,
    totalBatches: null
  };
}

/**
 * Save run state to Script Properties
 * @param {Object} state - The run state to save
 */
function saveRunState(state) {
  state.updatedAt = new Date().toISOString();
  const props = PropertiesService.getScriptProperties();
  const key = getRunStateKey(state.runId);
  props.setProperty(key, JSON.stringify(state));
}

/**
 * Load run state from Script Properties
 * @param {string} runId - The run ID
 * @returns {Object|null} The run state or null if not found
 */
function loadRunState(runId) {
  const props = PropertiesService.getScriptProperties();
  const key = getRunStateKey(runId);
  const data = props.getProperty(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    console.error(`Failed to parse run state for ${runId}:`, e);
    return null;
  }
}

/**
 * Delete run state from Script Properties
 * @param {string} runId - The run ID
 */
function deleteRunState(runId) {
  const props = PropertiesService.getScriptProperties();
  const key = getRunStateKey(runId);
  props.deleteProperty(key);
}

/**
 * Update run status
 * @param {string} runId - The run ID
 * @param {string} status - The new status
 * @param {string} message - Optional status message
 */
function updateRunStatus(runId, status, message = null) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.status = status;
  if (message) {
    state.lastMessage = message;
  }
  saveRunState(state);
}

/**
 * Update run with error
 * @param {string} runId - The run ID
 * @param {string} error - The error message
 */
function updateRunError(runId, error) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.status = RUN_STATUS.FAILED;
  state.lastError = error;
  saveRunState(state);
}

/**
 * Update Instagram progress
 * @param {string} runId - The run ID
 * @param {Object} progress - Progress update
 */
function updateInstagramProgress(runId, progress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.instagramProgress = {
    ...state.instagramProgress,
    ...progress
  };
  saveRunState(state);
}

/**
 * Update X progress
 * @param {string} runId - The run ID
 * @param {Object} progress - Progress update
 */
function updateXProgress(runId, progress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.xProgress = {
    ...state.xProgress,
    ...progress
  };
  saveRunState(state);
}

/**
 * Update TikTok progress
 * @param {string} runId - The run ID
 * @param {Object} progress - Progress update
 */
function updateTikTokProgress(runId, progress) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.tiktokProgress = {
    ...state.tiktokProgress,
    ...progress
  };
  saveRunState(state);
}

/**
 * Add processed post ID for deduplication
 * @param {string} runId - The run ID
 * @param {string} platform - 'instagram', 'x', or 'tiktok'
 * @param {string} postId - The post ID
 */
function addProcessedPostId(runId, platform, postId) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  if (platform === 'instagram') {
    if (!state.instagramProgress.processedIds.includes(postId)) {
      state.instagramProgress.processedIds.push(postId);
    }
  } else if (platform === 'x') {
    if (!state.xProgress) {
      state.xProgress = { collected: 0, target: 0, cursor: null, processedIds: [] };
    }
    if (!state.xProgress.processedIds.includes(postId)) {
      state.xProgress.processedIds.push(postId);
    }
  } else if (platform === 'tiktok') {
    if (!state.tiktokProgress.processedIds.includes(postId)) {
      state.tiktokProgress.processedIds.push(postId);
    }
  }

  saveRunState(state);
}

/**
 * Check if a post ID has already been processed (for deduplication)
 * @param {string} runId - The run ID
 * @param {string} platform - 'instagram', 'x', or 'tiktok'
 * @param {string} postId - The post ID
 * @returns {boolean}
 */
function isPostProcessed(runId, platform, postId) {
  const state = loadRunState(runId);
  if (!state) {
    return false;
  }

  if (platform === 'instagram') {
    return state.instagramProgress.processedIds.includes(postId);
  } else if (platform === 'x') {
    return state.xProgress?.processedIds?.includes(postId) || false;
  } else if (platform === 'tiktok') {
    return state.tiktokProgress.processedIds.includes(postId);
  }

  return false;
}

/**
 * Set the plan for a run
 * @param {string} runId - The run ID
 * @param {Object} plan - The plan object from LLM
 */
function setRunPlan(runId, plan) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  state.plan = plan;

  // Set targets from plan
  if (plan.targetCounts) {
    if (plan.targetCounts.instagram !== undefined) {
      state.instagramProgress.target = plan.targetCounts.instagram;
    }
    if (plan.targetCounts.x !== undefined) {
      state.xProgress.target = plan.targetCounts.x;
    }
    if (plan.targetCounts.tiktok !== undefined) {
      state.tiktokProgress.target = plan.targetCounts.tiktok;
    }
  }

  saveRunState(state);
}

/**
 * Set created resource IDs
 * @param {string} runId - The run ID
 * @param {Object} resources - Resource IDs to set
 */
function setRunResources(runId, resources) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run state not found for ${runId}`);
  }

  if (resources.spreadsheetId) {
    state.spreadsheetId = resources.spreadsheetId;
  }
  if (resources.spreadsheetUrl) {
    state.spreadsheetUrl = resources.spreadsheetUrl;
  }
  if (resources.runFolderId) {
    state.runFolderId = resources.runFolderId;
  }
  if (resources.instagramFolderId) {
    state.instagramFolderId = resources.instagramFolderId;
  }
  if (resources.xFolderId) {
    state.xFolderId = resources.xFolderId;
  }
  if (resources.tiktokFolderId) {
    state.tiktokFolderId = resources.tiktokFolderId;
  }

  saveRunState(state);
}

/**
 * Get a summary of run state for UI display
 * @param {string} runId - The run ID
 * @returns {Object} Summary for display
 */
function getRunSummary(runId) {
  const state = loadRunState(runId);
  if (!state) {
    return null;
  }

  return {
    runId: state.runId,
    status: state.status,
    spreadsheetUrl: state.spreadsheetUrl,
    instagramCollected: state.instagramProgress.collected,
    instagramTarget: state.instagramProgress.target,
    xCollected: state.xProgress?.collected || 0,
    xTarget: state.xProgress?.target || 0,
    tiktokCollected: state.tiktokProgress.collected,
    tiktokTarget: state.tiktokProgress.target,
    lastMessage: state.lastMessage,
    lastError: state.lastError,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

/**
 * List all run IDs (for debugging/admin)
 * @returns {string[]} Array of run IDs
 */
function listAllRunIds() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const prefix = 'RUN_STATE_';

  return Object.keys(allProps)
    .filter(key => key.startsWith(prefix))
    .map(key => key.substring(prefix.length));
}

/**
 * Clean up old run states (keep last N runs)
 * @param {number} keepCount - Number of recent runs to keep
 */
function cleanupOldRunStates(keepCount = 50) {
  const runIds = listAllRunIds();

  // Sort by run ID (which includes timestamp) descending
  runIds.sort().reverse();

  // Delete runs beyond keepCount
  const toDelete = runIds.slice(keepCount);
  toDelete.forEach(runId => deleteRunState(runId));

  return toDelete.length;
}
