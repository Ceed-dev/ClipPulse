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
 * @param {string} instruction - The user's natural language instruction
 * @returns {Object} Run info including runId and spreadsheetUrl
 */
function startRun(instruction) {
  // Skip validation in mock mode
  if (!isMockMode()) {
    const configValidation = validateConfig();
    if (!configValidation.isValid) {
      throw new Error(`Missing configuration: ${configValidation.missingKeys.join(', ')}`);
    }
  }

  // Generate run ID
  const runId = generateRunId();
  console.log(`Starting run: ${runId}`);

  // Create initial run state
  const state = createRunState(runId, instruction);
  saveRunState(state);

  try {
    // Update status to PLANNING
    updateRunStatus(runId, RUN_STATUS.PLANNING, 'Parsing instruction...');

    // Parse instruction with LLM
    const plan = parseInstructionToPlan(instruction);
    setRunPlan(runId, plan);

    // Create Drive folder structure
    updateRunStatus(runId, RUN_STATUS.PLANNING, 'Creating folder structure...');
    const folders = createRunFolderStructure(runId);

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
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
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

  // Determine current phase based on status
  switch (state.status) {
    case RUN_STATUS.CREATED:
    case RUN_STATUS.PLANNING:
      // Move to Instagram collection first
      if (plan.targetCounts.instagram > 0 && (isMetaAuthorized() || isMockMode())) {
        updateRunStatus(runId, RUN_STATUS.RUNNING_INSTAGRAM, 'Collecting Instagram data...');
        executeRunPhase(runId, loadRunState(runId));
      } else if (plan.targetCounts.x > 0 && (isXConfigured() || isMockMode())) {
        updateRunStatus(runId, RUN_STATUS.RUNNING_X, 'Collecting X data...');
        executeRunPhase(runId, loadRunState(runId));
      } else if (plan.targetCounts.tiktok > 0) {
        updateRunStatus(runId, RUN_STATUS.RUNNING_TIKTOK, 'Collecting TikTok data...');
        executeRunPhase(runId, loadRunState(runId));
      } else {
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
  const state = loadRunState(runId);
  const target = plan.targetCounts.instagram;
  let collected = state.instagramProgress.collected;

  if (!isMetaAuthorized() && !isMockMode()) {
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
  const state = loadRunState(runId);
  const target = plan.targetCounts.x;
  let collected = state.xProgress?.collected || 0;

  if (!isXConfigured() && !isMockMode()) {
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
    updateRunStatus(runId, RUN_STATUS.COMPLETED,
      `Completed: Instagram ${summary.instagramCollected}/${summary.instagramTarget}, ` +
      `X ${summary.xCollected}/${summary.xTarget}, ` +
      `TikTok ${summary.tiktokCollected}/${summary.tiktokTarget}`);

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
