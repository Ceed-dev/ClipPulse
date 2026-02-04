/**
 * DriveManager.js
 * Manages Google Drive folder structure and file operations
 *
 * Folder structure as defined in specification section 8:
 * ClipPulse/
 *   runs/
 *     YYYY/
 *       MM/
 *         YYYYMMDD_HHMMSS_<runShortId>/
 *           spreadsheet/
 *           instagram/
 *           tiktok/
 *   manifests/
 */

/**
 * Get or create the root ClipPulse folder
 * If CLIPPULSE_PARENT_FOLDER_ID is set, creates inside that folder (e.g., Shared Drive)
 * @returns {GoogleAppsScript.Drive.Folder} The root folder
 */
function getRootFolder() {
  const folderId = getConfig(CONFIG_KEYS.CLIPPULSE_ROOT_FOLDER_ID);

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      console.error('Root folder not found by ID, will create new one');
    }
  }

  // Check if a parent folder is specified (for Shared Drives)
  const parentFolderId = getConfig('CLIPPULSE_PARENT_FOLDER_ID');
  let parentFolder = null;

  if (parentFolderId) {
    try {
      parentFolder = DriveApp.getFolderById(parentFolderId);
      console.log('Using parent folder:', parentFolder.getName());
    } catch (e) {
      console.error('Parent folder not found, will create in My Drive');
    }
  }

  // Try to find existing ClipPulse folder in parent
  if (parentFolder) {
    const folders = parentFolder.getFoldersByName('ClipPulse');
    if (folders.hasNext()) {
      const folder = folders.next();
      setConfig(CONFIG_KEYS.CLIPPULSE_ROOT_FOLDER_ID, folder.getId());
      return folder;
    }
  } else {
    // Try to find in My Drive
    const folders = DriveApp.getFoldersByName('ClipPulse');
    if (folders.hasNext()) {
      const folder = folders.next();
      setConfig(CONFIG_KEYS.CLIPPULSE_ROOT_FOLDER_ID, folder.getId());
      return folder;
    }
  }

  // Create new root folder
  let newFolder;
  if (parentFolder) {
    newFolder = parentFolder.createFolder('ClipPulse');
  } else {
    newFolder = DriveApp.createFolder('ClipPulse');
  }

  setConfig(CONFIG_KEYS.CLIPPULSE_ROOT_FOLDER_ID, newFolder.getId());

  // Create manifests subfolder
  newFolder.createFolder('manifests');

  // Create runs subfolder
  newFolder.createFolder('runs');

  return newFolder;
}

/**
 * Get or create a subfolder within a parent folder
 * @param {GoogleAppsScript.Drive.Folder} parent - Parent folder
 * @param {string} name - Subfolder name
 * @returns {GoogleAppsScript.Drive.Folder} The subfolder
 */
function getOrCreateSubfolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parent.createFolder(name);
}

/**
 * Create the folder structure for a new run
 * @param {string} runId - The run ID (format: YYYYMMDD_HHMMSS_<hash>)
 * @param {string} [targetFolderId] - Optional target folder ID (for API mode / n8n integration)
 * @returns {Object} Object containing folder IDs
 */
function createRunFolderStructure(runId, targetFolderId = null) {
  let runFolder;

  if (targetFolderId) {
    // API mode: Create subfolders directly in the target folder (e.g., n8n run folder)
    try {
      const targetFolder = DriveApp.getFolderById(targetFolderId);
      // Create a ClipPulse subfolder within the target folder
      runFolder = targetFolder.createFolder(`clippulse_${runId}`);
      console.log(`Created run folder in target folder: ${targetFolderId}`);
    } catch (e) {
      console.error(`Failed to access target folder ${targetFolderId}:`, e);
      throw new Error(`Target folder not accessible: ${targetFolderId}`);
    }
  } else {
    // UI mode: Use default ClipPulse folder structure
    const root = getRootFolder();
    const runsFolder = getOrCreateSubfolder(root, 'runs');

    // Parse date from run ID
    const year = runId.substring(0, 4);
    const month = runId.substring(4, 6);

    // Create year/month folders
    const yearFolder = getOrCreateSubfolder(runsFolder, year);
    const monthFolder = getOrCreateSubfolder(yearFolder, month);

    // Create run folder
    runFolder = monthFolder.createFolder(runId);
  }

  // Create subfolders for the run
  const spreadsheetFolder = runFolder.createFolder('spreadsheet');
  const instagramFolder = runFolder.createFolder('instagram');
  const xFolder = runFolder.createFolder('x');
  const tiktokFolder = runFolder.createFolder('tiktok');

  return {
    runFolderId: runFolder.getId(),
    runFolderUrl: runFolder.getUrl(),
    spreadsheetFolderId: spreadsheetFolder.getId(),
    instagramFolderId: instagramFolder.getId(),
    xFolderId: xFolder.getId(),
    tiktokFolderId: tiktokFolder.getId()
  };
}

/**
 * Create a post artifact folder
 * @param {string} platformFolderId - The platform folder ID (instagram or tiktok)
 * @param {string} postId - The platform post ID
 * @returns {GoogleAppsScript.Drive.Folder} The post folder
 */
function createPostFolder(platformFolderId, postId) {
  const platformFolder = DriveApp.getFolderById(platformFolderId);
  return platformFolder.createFolder(postId);
}

/**
 * Save raw JSON data for a post
 * @param {GoogleAppsScript.Drive.Folder} postFolder - The post folder
 * @param {Object} rawData - The raw API response data
 * @returns {GoogleAppsScript.Drive.File} The created file
 */
function saveRawJson(postFolder, rawData) {
  const content = JSON.stringify(rawData, null, 2);
  return postFolder.createFile('raw.json', content, MimeType.PLAIN_TEXT);
}

/**
 * Create a watch.html artifact with links to watch the video
 * @param {GoogleAppsScript.Drive.Folder} postFolder - The post folder
 * @param {Object} links - Object containing watch URLs
 * @param {string} links.watchUrl - Primary watch URL
 * @param {string} [links.embedUrl] - Optional embed URL
 * @param {string} [links.username] - Username for display
 * @param {string} [links.platform] - Platform name
 * @returns {GoogleAppsScript.Drive.File} The created file
 */
function createWatchArtifact(postFolder, links) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Watch Video - ${links.platform || 'Video'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      text-align: center;
    }
    h1 { color: #333; }
    .link-box {
      margin: 20px 0;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    a {
      display: inline-block;
      padding: 12px 24px;
      background: #0095f6;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px;
    }
    a:hover { background: #0077cc; }
    .meta { color: #666; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>${links.platform || 'Video'} Watch Link</h1>
  ${links.username ? `<p>Creator: @${links.username}</p>` : ''}

  <div class="link-box">
    <a href="${links.watchUrl}" target="_blank">Watch Video</a>
    ${links.embedUrl ? `<a href="${links.embedUrl}" target="_blank">Embed Link</a>` : ''}
  </div>

  <p class="meta">
    Generated by ClipPulse<br>
    ${new Date().toISOString()}
  </p>
</body>
</html>`;

  return postFolder.createFile('watch.html', html, MimeType.HTML);
}

/**
 * Download and save a video file
 * @param {GoogleAppsScript.Drive.Folder} postFolder - The post folder
 * @param {string} videoUrl - The video URL to download
 * @param {string} filename - The filename (default: video.mp4)
 * @returns {GoogleAppsScript.Drive.File|null} The created file or null if failed
 */
function saveVideoFile(postFolder, videoUrl, filename = 'video.mp4') {
  try {
    const response = UrlFetchApp.fetch(videoUrl, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() !== 200) {
      console.error(`Failed to download video: HTTP ${response.getResponseCode()}`);
      return null;
    }

    const blob = response.getBlob().setName(filename);

    // Check size limit (Apps Script has ~50MB limit for blobs)
    if (blob.getBytes().length > 50 * 1024 * 1024) {
      console.error('Video file too large for Apps Script limits');
      return null;
    }

    return postFolder.createFile(blob);
  } catch (e) {
    console.error('Error downloading video:', e);
    return null;
  }
}

/**
 * Download and save a thumbnail image
 * @param {GoogleAppsScript.Drive.Folder} postFolder - The post folder
 * @param {string} thumbnailUrl - The thumbnail URL
 * @returns {GoogleAppsScript.Drive.File|null} The created file or null if failed
 */
function saveThumbnail(postFolder, thumbnailUrl) {
  try {
    const response = UrlFetchApp.fetch(thumbnailUrl, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() !== 200) {
      return null;
    }

    const blob = response.getBlob().setName('thumbnail.jpg');
    return postFolder.createFile(blob);
  } catch (e) {
    console.error('Error downloading thumbnail:', e);
    return null;
  }
}

/**
 * Get the Drive URL for a file
 * @param {GoogleAppsScript.Drive.File} file - The Drive file
 * @returns {string} The file URL
 */
function getFileUrl(file) {
  return file.getUrl();
}

/**
 * Create post artifacts and return the drive_url
 * This handles the logic from specification section 8.3:
 * - If video.mp4 exists → drive_url = URL to video.mp4
 * - Else → drive_url = URL to watch.html
 *
 * @param {string} platformFolderId - The platform folder ID
 * @param {string} postId - The platform post ID
 * @param {Object} postData - The post data
 * @param {Object} rawApiResponse - The raw API response
 * @param {string} platform - 'instagram' or 'tiktok'
 * @returns {Object} Result containing driveUrl and memo notes
 */
function createPostArtifacts(platformFolderId, postId, postData, rawApiResponse, platform) {
  const postFolder = createPostFolder(platformFolderId, postId);
  const memoNotes = [];

  // Always save raw.json
  saveRawJson(postFolder, rawApiResponse);

  let driveUrl = null;
  let videoFile = null;

  if (platform === 'instagram') {
    // Instagram: Try to download video if media_url is a video URL
    if (postData.media_url && postData.media_type === 'VIDEO') {
      videoFile = saveVideoFile(postFolder, postData.media_url);
      if (!videoFile) {
        memoNotes.push('video not downloaded (URL too large or unavailable); stored watch.html instead');
      }
    }

    // Save thumbnail if available
    if (postData.thumbnail_url) {
      const thumbFile = saveThumbnail(postFolder, postData.thumbnail_url);
      if (!thumbFile) {
        memoNotes.push('thumbnail not downloaded');
      }
    }

    // Create watch artifact if no video downloaded
    if (!videoFile) {
      const watchFile = createWatchArtifact(postFolder, {
        watchUrl: postData.post_url || `https://www.instagram.com/p/${postData.shortcode}/`,
        username: postData.create_username,
        platform: 'Instagram'
      });
      driveUrl = getFileUrl(watchFile);
    } else {
      driveUrl = getFileUrl(videoFile);
    }

  } else if (platform === 'tiktok') {
    // TikTok: Research API doesn't guarantee downloadable video URLs
    // Always create watch.html as primary artifact

    // Construct watch URL
    const watchUrl = postData.share_url ||
      `https://www.tiktok.com/@${postData.create_username}/video/${postId}`;

    const watchFile = createWatchArtifact(postFolder, {
      watchUrl: watchUrl,
      embedUrl: postData.embed_link,
      username: postData.create_username,
      platform: 'TikTok'
    });

    driveUrl = getFileUrl(watchFile);

    // Note that video was not downloaded (expected for Research API)
    if (!postData.video_url) {
      memoNotes.push('video URL not available via Research API; stored watch.html');
    }
  }

  return {
    driveUrl: driveUrl,
    postFolderId: postFolder.getId(),
    postFolderUrl: postFolder.getUrl(),
    memo: memoNotes.join('; ')
  };
}

/**
 * Save run manifest to the manifests folder
 * @param {Object} runState - The complete run state
 * @returns {GoogleAppsScript.Drive.File} The manifest file
 */
function saveRunManifest(runState) {
  const root = getRootFolder();
  const manifestsFolder = getOrCreateSubfolder(root, 'manifests');

  const content = JSON.stringify(runState, null, 2);
  const filename = `${runState.runId}_manifest.json`;

  return manifestsFolder.createFile(filename, content, MimeType.PLAIN_TEXT);
}

/**
 * Move spreadsheet to the run's spreadsheet folder
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} spreadsheetFolderId - The target folder ID
 */
function moveSpreadsheetToRunFolder(spreadsheetId, spreadsheetFolderId) {
  const file = DriveApp.getFileById(spreadsheetId);
  const targetFolder = DriveApp.getFolderById(spreadsheetFolderId);

  // Add to new folder
  targetFolder.addFile(file);

  // Remove from root/original location
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() !== spreadsheetFolderId) {
      parent.removeFile(file);
    }
  }
}
