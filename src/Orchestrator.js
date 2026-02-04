/**
 * Orchestrator.js
 * Run Orchestrator - coordinates the entire data collection process
 *
 * Responsibilities:
 * - Creates run folders + spreadsheet
 * - Stores run state
 * - Schedules continuation triggers
 * - Coordinates platform collectors
 *
 * Specification section 10 and Phase 4
 */

/**
 * Start a new collection run
 * This is the shared business logic used by both UI and API modes.
 *
 * @param {string} instruction - The user's natural language instruction
 * @param {Object} [options] - Optional parameters (for API mode)
 * @param {string} [options.externalRunId] - External run ID from n8n
 * @param {string} [options.targetFolderId] - Target folder ID for output
 * @param {string} [options.source] - Source of the run ('ui' or 'api')
 * @returns {Object} Run info including runId and spreadsheetUrl
 */
function startRun(instruction, options = {}) {
  // Skip validation in mock mode
  if (!isMockMode()) {
    const configValidation = validateConfig();
    if (!configValidation.isValid) {
      throw new Error(`Missing configuration: ${configValidation.missingKeys.join(', ')}`);
    }

    // Check platform configuration BEFORE starting the run
    const hasInstagram = isMetaAuthorized();
    const hasX = isXConfigured();

    console.log(`[DEBUG] startRun: Platform check - Instagram authorized: ${hasInstagram}, X configured: ${hasX}`);

    if (!hasInstagram && !hasX) {
      throw new Error(
        'No platforms configured for data collection.\n\n' +
        'To enable X (Twitter):\n' +
        '  - Add X_API_KEY to Script Properties\n\n' +
        'To enable Instagram:\n' +
        '  - Complete Meta OAuth authorization\n' +
        '  - Run logAuthUrls() to get the authorization URL\n\n' +
        'At least one platform must be configured to collect data.'
      );
    }
  }

  // Generate run ID (use external_run_id if provided, otherwise generate)
  const runId = options.externalRunId || generateRunId();
  console.log(`Starting run: ${runId} (source: ${options.source || 'ui'})`);

  // Create initial run state with options
  const state = createRunState(runId, instruction, {
    externalRunId: options.externalRunId,
    targetFolderId: options.targetFolderId,
    source: options.source || 'ui'
  });
  saveRunState(state);

  try {
    // Update status to PLANNING
    updateRunStatus(runId, RUN_STATUS.PLANNING, 'Parsing instruction...');

    // Parse instruction with LLM
    const plan = parseInstructionToPlan(instruction);
    setRunPlan(runId, plan);

    // Create Drive folder structure (with optional target folder)
    updateRunStatus(runId, RUN_STATUS.PLANNING, 'Creating folder structure...');
    const folders = createRunFolderStructure(runId, options.targetFolderId);

    // Create spreadsheet
    updateRunStatus(runId, RUN_STATUS.PLANNING, 'Creating spreadsheet...');
    const spreadsheet = createRunSpreadsheet(runId);

    // Move spreadsheet to run folder
    moveSpreadsheetToRunFolder(spreadsheet.spreadsheetId, folders.spreadsheetFolderId);

    // Save resource IDs
    setRunResources(runId, {
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      runFolderId: folders.runFolderId,
      instagramFolderId: folders.instagramFolderId,
      xFolderId: folders.xFolderId,
      tiktokFolderId: folders.tiktokFolderId
    });

    // Schedule the collection process
    scheduleCollection(runId);

    return {
      runId: runId,
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      runFolderId: folders.runFolderId,
      status: RUN_STATUS.PLANNING,
      plan: plan
    };

  } catch (e) {
    console.error('Error starting run:', e);
    updateRunError(runId, e.message);
    throw e;
  }
}

/**
 * Schedule the collection process
 * Uses a time-based trigger for continuation
 * @param {string} runId - The run ID
 */
function scheduleCollection(runId) {
  // Delete any existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'continueRun') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create a new trigger to run after 1 second
  ScriptApp.newTrigger('continueRun')
    .timeBased()
    .after(1000)
    .create();

  // Store the run ID for the trigger to pick up
  PropertiesService.getScriptProperties().setProperty('PENDING_RUN_ID', runId);
}

/**
 * Continue a run (called by trigger)
 * This is the main collection loop
 */
function continueRun() {
  const props = PropertiesService.getScriptProperties();
  const runId = props.getProperty('PENDING_RUN_ID');

  if (!runId) {
    console.log('No pending run to continue');
    return;
  }

  const state = loadRunState(runId);
  if (!state) {
    console.error(`Run state not found: ${runId}`);
    props.deleteProperty('PENDING_RUN_ID');
    return;
  }

  // Check if already completed or failed
  if (state.status === RUN_STATUS.COMPLETED || state.status === RUN_STATUS.FAILED) {
    console.log(`Run ${runId} already ${state.status}`);
    props.deleteProperty('PENDING_RUN_ID');
    cleanupTriggers();
    return;
  }

  try {
    executeRunPhase(runId, state);
  } catch (e) {
    console.error(`Error in run ${runId}:`, e);
    updateRunError(runId, e.message);
    props.deleteProperty('PENDING_RUN_ID');
    cleanupTriggers();
  }
}

/**
 * Execute the current phase of a run
 * @param {string} runId - The run ID
 * @param {Object} state - The current run state
 */
function executeRunPhase(runId, state) {
  const startTime = Date.now();
  const maxExecutionTime = 5 * 60 * 1000; // 5 minutes (leave buffer before 6 min limit)

  const plan = state.plan;

  // Debug logging for troubleshooting
  const metaAuth = isMetaAuthorized();
  const xConfigured = isXConfigured();
  const mockMode = isMockMode();
  console.log(`[DEBUG] executeRunPhase: status=${state.status}`);
  console.log(`[DEBUG] targetCounts: instagram=${plan.targetCounts.instagram}, x=${plan.targetCounts.x}, tiktok=${plan.targetCounts.tiktok}`);
  console.log(`[DEBUG] Auth status: isMetaAuthorized=${metaAuth}, isXConfigured=${xConfigured}, isMockMode=${mockMode}`);

  // Determine current phase based on status
  switch (state.status) {
    case RUN_STATUS.CREATED:
    case RUN_STATUS.PLANNING:
      // Move to Instagram collection first
      if (plan.targetCounts.instagram > 0 && (metaAuth || mockMode)) {
        console.log('[DEBUG] Starting Instagram collection');
        updateRunStatus(runId, RUN_STATUS.RUNNING_INSTAGRAM, 'Collecting Instagram data...');
        executeRunPhase(runId, loadRunState(runId));
      } else if (plan.targetCounts.x > 0 && (xConfigured || mockMode)) {
        console.log('[DEBUG] Starting X collection (Instagram skipped or not configured)');
        updateRunStatus(runId, RUN_STATUS.RUNNING_X, 'Collecting X data...');
        executeRunPhase(runId, loadRunState(runId));
      } else if (plan.targetCounts.tiktok > 0) {
        console.log('[DEBUG] Starting TikTok collection');
        updateRunStatus(runId, RUN_STATUS.RUNNING_TIKTOK, 'Collecting TikTok data...');
        executeRunPhase(runId, loadRunState(runId));
      } else {
        console.log('[DEBUG] No collection to perform, finalizing immediately');
        console.log('[DEBUG] This is likely a bug - check isMetaAuthorized() and isXConfigured() implementations');
        finalizeRun(runId);
      }
      break;

    case RUN_STATUS.RUNNING_INSTAGRAM:
      collectInstagramWithTimeout(runId, plan, startTime, maxExecutionTime);
      break;

    case RUN_STATUS.RUNNING_X:
      collectXWithTimeout(runId, plan, startTime, maxExecutionTime);
      break;

    case RUN_STATUS.RUNNING_TIKTOK:
      collectTikTokWithTimeout(runId, plan, startTime, maxExecutionTime);
      break;

    case RUN_STATUS.FINALIZING:
      finalizeRun(runId);
      break;
  }
}

/**
 * Collect Instagram data with timeout handling
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} startTime - Start timestamp
 * @param {number} maxTime - Maximum execution time in ms
 */
function collectInstagramWithTimeout(runId, plan, startTime, maxTime) {
  console.log('[DEBUG] collectInstagramWithTimeout called');
  const state = loadRunState(runId);
  const target = plan.targetCounts.instagram;
  let collected = state.instagramProgress.collected;
  console.log(`[DEBUG] Instagram target=${target}, collected=${collected}`);

  if (!isMetaAuthorized() && !isMockMode()) {
    console.log('[DEBUG] Instagram not authorized and not mock mode, skipping');
    updateRunStatus(runId, RUN_STATUS.RUNNING_INSTAGRAM,
      'Instagram not authorized; skipping');
    moveToNextPhase(runId, 'instagram');
    return;
  }

  try {
    // Use mock collector if mock mode is enabled
    const collectFn = isMockMode() ? collectInstagramWithMocks : collectInstagramMedia;
    const result = collectFn(runId, plan, (progress) => {
      // Check timeout
      if (Date.now() - startTime > maxTime) {
        throw new Error('TIMEOUT');
      }
    });

    collected = result.collected;

    // Check if we got enough
    if (collected < target) {
      // Try to expand search
      const expandedPlan = expandInstagramSearch(runId, plan);
      setRunPlan(runId, expandedPlan);

      // If still time, continue collecting
      if (Date.now() - startTime < maxTime - 30000) {
        const additionalResult = collectInstagramMedia(runId, expandedPlan, (progress) => {
          if (Date.now() - startTime > maxTime) {
            throw new Error('TIMEOUT');
          }
        });
        collected = additionalResult.collected;
      }
    }

    // Move to next phase
    moveToNextPhase(runId, 'instagram');

  } catch (e) {
    if (e.message === 'TIMEOUT') {
      console.log('Instagram collection timeout, scheduling continuation');
      scheduleContinuation(runId);
    } else {
      throw e;
    }
  }
}

/**
 * Collect X data with timeout handling
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} startTime - Start timestamp
 * @param {number} maxTime - Maximum execution time in ms
 */
function collectXWithTimeout(runId, plan, startTime, maxTime) {
  console.log('[DEBUG] collectXWithTimeout called');
  const state = loadRunState(runId);
  const target = plan.targetCounts.x;
  let collected = state.xProgress?.collected || 0;
  console.log(`[DEBUG] X target=${target}, collected=${collected}`);

  if (!isXConfigured() && !isMockMode()) {
    console.log('[DEBUG] X API not configured and not mock mode, skipping');
    updateRunStatus(runId, RUN_STATUS.RUNNING_X,
      'X API not configured; skipping');
    moveToNextPhase(runId, 'x');
    return;
  }

  try {
    // Use mock collector if mock mode is enabled
    const collectFn = isMockMode() ? collectXWithMocks : collectXTweets;
    const result = collectFn(runId, plan, (progress) => {
      // Check timeout
      if (Date.now() - startTime > maxTime) {
        throw new Error('TIMEOUT');
      }
    });

    collected = result.collected;

    // Check if we got enough
    if (collected < target) {
      // Try to expand search
      const expandedPlan = expandXSearch(runId, plan);
      setRunPlan(runId, expandedPlan);

      // If still time, continue collecting
      if (Date.now() - startTime < maxTime - 30000) {
        const additionalResult = collectXTweets(runId, expandedPlan, (progress) => {
          if (Date.now() - startTime > maxTime) {
            throw new Error('TIMEOUT');
          }
        });
        collected = additionalResult.collected;
      }
    }

    // Move to next phase
    moveToNextPhase(runId, 'x');

  } catch (e) {
    if (e.message === 'TIMEOUT') {
      console.log('X collection timeout, scheduling continuation');
      scheduleContinuation(runId);
    } else {
      throw e;
    }
  }
}

/**
 * Collect TikTok data with timeout handling
 * @param {string} runId - The run ID
 * @param {Object} plan - The collection plan
 * @param {number} startTime - Start timestamp
 * @param {number} maxTime - Maximum execution time in ms
 */
function collectTikTokWithTimeout(runId, plan, startTime, maxTime) {
  const state = loadRunState(runId);
  const target = plan.targetCounts.tiktok;
  let collected = state.tiktokProgress.collected;

  const hasResearch = isTikTokResearchConfigured();
  const hasDisplay = isTikTokDisplayConfigured() && isTikTokDisplayAuthorized();

  if (!hasResearch && !hasDisplay && !isMockMode()) {
    updateRunStatus(runId, RUN_STATUS.RUNNING_TIKTOK,
      'TikTok API not configured; skipping');
    moveToNextPhase(runId, 'tiktok');
    return;
  }

  try {
    // Use mock collector if mock mode is enabled
    const collectFn = isMockMode() ? collectTikTokWithMocks : collectTikTokVideos;
    const result = collectFn(runId, plan, (progress) => {
      if (Date.now() - startTime > maxTime) {
        throw new Error('TIMEOUT');
      }
    });

    collected = result.collected;

    // Check if we got enough
    if (collected < target) {
      const expandedPlan = expandTikTokSearch(runId, plan);
      setRunPlan(runId, expandedPlan);

      if (Date.now() - startTime < maxTime - 30000) {
        const additionalResult = collectTikTokVideos(runId, expandedPlan, (progress) => {
          if (Date.now() - startTime > maxTime) {
            throw new Error('TIMEOUT');
          }
        });
        collected = additionalResult.collected;
      }
    }

    // Move to next phase
    moveToNextPhase(runId, 'tiktok');

  } catch (e) {
    if (e.message === 'TIMEOUT') {
      console.log('TikTok collection timeout, scheduling continuation');
      scheduleContinuation(runId);
    } else {
      throw e;
    }
  }
}

/**
 * Move to the next phase after completing current one
 * @param {string} runId - The run ID
 * @param {string} completedPhase - The phase that was completed
 */
function moveToNextPhase(runId, completedPhase) {
  const state = loadRunState(runId);
  const plan = state.plan;

  if (completedPhase === 'instagram') {
    // Check if we need to do X
    if (plan.targetCounts.x > 0 && (isXConfigured() || isMockMode())) {
      updateRunStatus(runId, RUN_STATUS.RUNNING_X, 'Collecting X data...');
      scheduleContinuation(runId);
    } else if (plan.targetCounts.tiktok > 0) {
      updateRunStatus(runId, RUN_STATUS.RUNNING_TIKTOK, 'Collecting TikTok data...');
      scheduleContinuation(runId);
    } else {
      updateRunStatus(runId, RUN_STATUS.FINALIZING, 'Finalizing...');
      scheduleContinuation(runId);
    }
  } else if (completedPhase === 'x') {
    // Check if we need to do TikTok
    if (plan.targetCounts.tiktok > 0) {
      updateRunStatus(runId, RUN_STATUS.RUNNING_TIKTOK, 'Collecting TikTok data...');
      scheduleContinuation(runId);
    } else {
      updateRunStatus(runId, RUN_STATUS.FINALIZING, 'Finalizing...');
      scheduleContinuation(runId);
    }
  } else if (completedPhase === 'tiktok') {
    updateRunStatus(runId, RUN_STATUS.FINALIZING, 'Finalizing...');
    scheduleContinuation(runId);
  }
}

/**
 * Schedule a continuation trigger
 * @param {string} runId - The run ID
 */
function scheduleContinuation(runId) {
  PropertiesService.getScriptProperties().setProperty('PENDING_RUN_ID', runId);

  // Create trigger for continuation
  ScriptApp.newTrigger('continueRun')
    .timeBased()
    .after(2000) // 2 second delay
    .create();
}

/**
 * Finalize a run
 * @param {string} runId - The run ID
 */
function finalizeRun(runId) {
  const state = loadRunState(runId);

  try {
    // Finalize spreadsheet formatting
    finalizeSpreadsheet(state.spreadsheetId);

    // Save manifest
    saveRunManifest(state);

    // Update status to completed
    const summary = getRunSummary(runId);
    const totalCollected = (summary.instagramCollected || 0) + (summary.xCollected || 0) + (summary.tiktokCollected || 0);

    // Check if 0 data was collected - this indicates a configuration issue
    if (totalCollected === 0) {
      const metaAuth = isMetaAuthorized();
      const xConfig = isXConfigured();
      console.log(`[WARNING] finalizeRun: 0 data collected! Instagram authorized: ${metaAuth}, X configured: ${xConfig}`);

      updateRunStatus(runId, RUN_STATUS.COMPLETED,
        `WARNING: No data collected (0 posts).\n` +
        `Platform status: Instagram authorized: ${metaAuth}, X configured: ${xConfig}\n` +
        `Please check platform configuration.`);
    } else {
      updateRunStatus(runId, RUN_STATUS.COMPLETED,
        `Completed: Instagram ${summary.instagramCollected}/${summary.instagramTarget}, ` +
        `X ${summary.xCollected}/${summary.xTarget}, ` +
        `TikTok ${summary.tiktokCollected}/${summary.tiktokTarget}`);
    }

    // Cleanup
    PropertiesService.getScriptProperties().deleteProperty('PENDING_RUN_ID');
    cleanupTriggers();

    console.log(`Run ${runId} completed successfully`);

  } catch (e) {
    console.error('Error finalizing run:', e);
    updateRunError(runId, `Finalization error: ${e.message}`);
  }
}

/**
 * Cleanup continuation triggers
 */
function cleanupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'continueRun') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Get the status of a run (for UI polling)
 * @param {string} runId - The run ID
 * @returns {Object} Run status summary
 */
function getRunStatus(runId) {
  return getRunSummary(runId);
}

/**
 * Cancel a running run
 * @param {string} runId - The run ID
 */
function cancelRun(runId) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (state.status === RUN_STATUS.COMPLETED || state.status === RUN_STATUS.FAILED) {
    throw new Error(`Run already ${state.status}`);
  }

  updateRunStatus(runId, RUN_STATUS.FAILED, 'Cancelled by user');
  PropertiesService.getScriptProperties().deleteProperty('PENDING_RUN_ID');
  cleanupTriggers();

  return { success: true, message: 'Run cancelled' };
}

/**
 * Retry a failed run from where it left off
 * @param {string} runId - The run ID
 * @returns {Object} Result
 */
function retryRun(runId) {
  const state = loadRunState(runId);
  if (!state) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (state.status !== RUN_STATUS.FAILED) {
    throw new Error('Can only retry failed runs');
  }

  // Determine which phase to resume from
  let newStatus;
  if (state.instagramProgress.collected < state.instagramProgress.target && isMetaAuthorized()) {
    newStatus = RUN_STATUS.RUNNING_INSTAGRAM;
  } else if (state.xProgress?.collected < state.xProgress?.target && isXConfigured()) {
    newStatus = RUN_STATUS.RUNNING_X;
  } else if (state.tiktokProgress.collected < state.tiktokProgress.target) {
    newStatus = RUN_STATUS.RUNNING_TIKTOK;
  } else {
    newStatus = RUN_STATUS.FINALIZING;
  }

  updateRunStatus(runId, newStatus, 'Retrying...');
  scheduleContinuation(runId);

  return {
    success: true,
    message: `Retrying from ${newStatus}`,
    spreadsheetUrl: state.spreadsheetUrl
  };
}

/**
 * Get all runs (for admin/debugging)
 * @param {number} limit - Maximum runs to return
 * @returns {Object[]} Array of run summaries
 */
function listRuns(limit = 20) {
  const runIds = listAllRunIds();
  return runIds
    .slice(0, limit)
    .map(id => getRunSummary(id))
    .filter(s => s !== null);
}
