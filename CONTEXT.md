# ClipPulse Development Context

This document tracks the development history, decisions, and context for the ClipPulse project. It is intended to help future AI assistants quickly understand the project state and continue work seamlessly.

## Project Summary

**ClipPulse** is a Google Apps Script-based tool for collecting short-form video trend data from Instagram (and potentially TikTok in the future). Users provide natural language instructions, which are parsed by an LLM (GPT-4o) to create structured collection plans. Data is output to Google Sheets with artifacts stored in Google Drive.

## Session Log

### 2026-02-02 - Documentation Consistency Review

**Participants:** Human + Claude Opus 4.5

**Context:**
The human requested a comprehensive review of the codebase before committing existing changes. The goal was to ensure all documentation accurately reflects the current implementation.

**Tasks Completed:**

1. **Full Codebase Exploration**
   - Read and analyzed all source files in `src/`
   - Documented the purpose and responsibilities of each module
   - Identified the complete data flow from user input to output

2. **README.md and Code Consistency Check**
   - Identified inconsistencies between documentation and implementation:
     - OpenAI model name: README said `gpt-5.2-pro`, code uses `gpt-4o`
     - API name: README said "Responses API", code uses "Chat Completions API"
     - Spreadsheet tabs: README mentioned "two tabs" but TikTok is disabled (one tab only)
     - Reference URLs pointed to non-existent documentation
   - Fixed all inconsistencies in README.md
   - Updated document version to 1.1 and date to 2026-02-02
   - Removed horizontal lines (`---`) for better readability per user request

3. **Code Comment Fixes**
   - Updated `LLMPlanner.js` header comment to reflect actual API usage
   - Updated `SheetWriter.js` header comment about tab count

4. **New Documentation Created**
   - `ARCHITECTURE.md`: Concise English summary of system architecture
   - `CONTEXT.md`: This file - work history and context for future sessions

**Files Modified:**
- `README.md` - Consistency fixes, removed horizontal lines
- `src/LLMPlanner.js` - Header comment fix
- `src/SheetWriter.js` - Header comment fix

**Files Created:**
- `ARCHITECTURE.md` - Architecture overview
- `CONTEXT.md` - Development context (this file)

**Pre-existing Uncommitted Changes (from before this session):**
The following files had uncommitted changes when this session started:
- `src/Auth.js`
- `src/Code.js`
- `src/Config.js`
- `src/InstagramCollector.js`
- `src/LLMPlanner.js`
- `src/appsscript.json`

These changes were made in previous sessions and relate to:
- Adding `checkStatus()` function for debugging auth status
- TikTok collection disabled for Instagram-only mode
- Various improvements to data collection and UI

**Current Project State:**
- TikTok collection: **Disabled** (code preserved for future use)
- Instagram collection: **Active** (using Graph API with hashtag search)
- LLM: OpenAI GPT-4o via Chat Completions API
- OAuth2: Meta/Instagram authentication implemented
- UI: Web App with dark mode, progress indicators, data fields toggle

**Known Limitations:**
- Instagram Graph API hashtag search does not return `media_url` (API limitation)
- Apps Script 6-minute execution limit handled via continuation triggers
- UrlFetch ~50MB size limit affects video downloads

## Technical Notes

### OpenAI Integration
- Model: `gpt-4o` (configurable via `OPENAI_MODEL` Script Property)
- API: Chat Completions (`/v1/chat/completions`)
- Mode: JSON mode enabled for structured outputs

### Instagram API
- Version: v18.0 (configurable)
- Strategies: Hashtag search (primary), Owned account media (fallback)
- Requires: Professional Instagram account connected to Facebook Page

### TikTok API (Disabled)
- Research API: Preferred but disabled
- Display API: Fallback but disabled
- Code preserved in `TikTokCollector.js` for future reactivation

### 2026-02-02 - Git Push Issue and Transfer to Local (Continued)

**Participants:** Human + Claude Opus 4.5

**Context:**
After completing all documentation updates and creating the commit, we encountered a Git push authentication issue on the VM environment.

**Issue:**
- VM uses HTTPS remote URL (`https://github.com/Ceed-dev/ClipPulse.git`)
- No credential helper configured on VM
- GitHub requires Personal Access Token (PAT) for HTTPS authentication (password auth deprecated since 2021)
- VM environment cannot handle interactive authentication prompts

**Commit Status:**
- **Commit created successfully:** `dbedb79`
- **Commit message:** "Update documentation and add architecture files"
- **Files in commit:** 10 files (1048 insertions, 62 deletions)
- **Push status:** NOT PUSHED (pending)

**What Needs to Be Done (on Local Machine):**
1. Transfer this project to local machine (or pull if already cloned)
2. Run `git push origin main` from local (where credential helper is configured)
3. After push succeeds, VM can sync via `git pull`

**Resolution:**
Human decided to transfer the project directly to local machine (`~/Programming/`) and continue work there. The VM will later sync via `git pull` after the local push succeeds.

### 2026-02-02 - X (Twitter) Platform Integration

**Participants:** Human + Claude Opus 4.5

**Context:**
The human requested adding X (Twitter) as a second data collection platform alongside Instagram. This major feature addition required changes across the entire codebase.

**Requirements:**
- Use TwitterAPI.io Advanced Search API for X data collection
- API endpoint: `https://api.twitterapi.io/twitter/tweet/advanced_search`
- API key authentication (X-API-Key header)
- Natural language input → OpenAI parsing → X API call → spreadsheet output
- Add X tab to spreadsheets
- Add X data fields toggle in UI (28 fields)
- Update all documentation
- Full automation: planning, implementation, testing, documentation, and git commit

**Files Created:**
- `src/XCollector.js` - New collector module for X/Twitter API integration
  - Functions: `callXAPI`, `searchTweets`, `buildXSearchQuery`, `collectXTweets`, `collectXViaTweetsSearch`, `processXTweet`, `expandXSearch`, `isXConfigured`, `testXAPI`
  - Query syntax support: keywords, hashtags, from:user, date ranges, language filters
  - Two query types: Latest (recent) and Top (popular)
  - Cursor-based pagination

**Files Modified:**

1. **src/SheetWriter.js**
   - Added `X_COLUMNS` array (28 fields for tweet data)
   - Updated `createRunSpreadsheet` to create X tab
   - Added `normalizeXPost` function for tweet normalization
   - Updated `getSheetForPlatform` and `getColumnsForPlatform` for 'x' platform

2. **src/Config.js**
   - Added `X_API_KEY: 'X_API_KEY'` to CONFIG_KEYS

3. **src/StateStore.js**
   - Added `RUNNING_X` to RUN_STATUS
   - Added `xProgress` object to run state (collected, target, cursor, processedIds)
   - Added `xFolderId` to run state
   - Added `updateXProgress` function
   - Updated `isPostProcessed`, `addProcessedPostId`, `setRunPlan`, `setRunResources`, `getRunSummary` for X support

4. **src/DriveManager.js**
   - Added `xFolder` creation in `createRunFolderStructure`
   - Returns `xFolderId` alongside other folder IDs

5. **src/LLMPlanner.js**
   - Updated `PLAN_SCHEMA` to include 'x' in targetPlatforms enum
   - Added X-specific fields in targetCounts and queryStrategy
   - Added X queryStrategy schema: customQuery, queryType, fromUsers, language, includeRetweets
   - Updated system prompt to detect both platforms from user instructions
   - Updated `createFallbackPlan` to detect platform mentions and extract @usernames

6. **src/Orchestrator.js**
   - Added `RUNNING_X` state handling in `executeRunPhase`
   - Added `collectXWithTimeout` function
   - Updated `moveToNextPhase` for Instagram→X→TikTok flow
   - Updated `finalizeRun` summary message
   - Updated `retryRun` to check X progress

7. **src/UI.html**
   - Added X examples to instruction placeholder
   - Added collapsible X data fields toggle (28 fields with descriptions)
   - Added X progress row in status panel
   - Updated `updateStatusDisplay` for X progress
   - Updated `getStatusMessage` with RUNNING_X case
   - Updated `formatStatus` with RUNNING_X mapping

8. **src/Mocks.js**
   - Added `generateMockXTweets` function
   - Added `mockXSearch` function
   - Added `collectXWithMocks` function for testing

9. **README.md** (v2.0)
   - Updated overview to mention Instagram and X
   - Added X API choice section (TwitterAPI.io)
   - Updated execution model (two tabs: Instagram and X)
   - Added X tab columns specification (28 columns)
   - Added X collection strategy documentation
   - Added X API configuration instructions
   - Updated all relevant sections for dual-platform support

10. **ARCHITECTURE.md**
    - Added X platform to system architecture diagram
    - Added X Collector component description
    - Added X tab column schema
    - Added X API query syntax reference
    - Updated data flow diagram
    - Updated storage structure
    - Updated configuration requirements

**X Tab Column Schema (28 columns):**
1. platform_post_id (tweet ID)
2. create_username (author username)
3. posted_at (ISO 8601)
4. text (tweet content)
5. post_url (tweet URL)
6. source (client app)
7. retweet_count
8. reply_count
9. like_count
10. quote_count
11. view_count
12. lang
13. is_reply
14. in_reply_to_id
15. conversation_id
16. author_id
17. author_name
18. author_display_name
19. author_followers
20. author_following
21. author_is_blue_verified
22. author_created_at
23. hashtags (JSON array)
24. urls (JSON array)
25. user_mentions (JSON array)
26. media (JSON array)
27. drive_url
28. memo

**Platform Detection Logic:**
- User mentions "Twitter", "X", "tweets", or "@username" → include X
- User mentions "Instagram", "IG", "posts", "#hashtag" → include Instagram
- No specific platform mention → collect from BOTH platforms by default

**Technical Notes:**
- X uses simple API key auth (no OAuth flow needed)
- X artifacts: always `watch.html` with tweet permalink (no video download)
- Collection order: Instagram → X → TikTok (TikTok still disabled)
- Batch processing and continuation triggers work for X same as Instagram

**Configuration:**
To use X collection, add to Script Properties:
- `X_API_KEY`: TwitterAPI.io API key

## Guidelines for Future Sessions

1. **Before Making Changes:** Always read this CONTEXT.md file first
2. **After Making Changes:** Append a new session entry to this file
3. **Documentation:** Keep README.md and code comments in sync
4. **Commits:** Verify no sensitive information before committing
5. **TikTok:** Code exists but is disabled; do not remove unless explicitly requested
6. **Git Push on VM:** VM lacks credential helper; push from local machine instead
7. **X Platform:** Fully implemented; requires `X_API_KEY` in Script Properties
