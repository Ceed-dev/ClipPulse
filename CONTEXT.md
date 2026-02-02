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

## Guidelines for Future Sessions

1. **Before Making Changes:** Always read this CONTEXT.md file first
2. **After Making Changes:** Append a new session entry to this file
3. **Documentation:** Keep README.md and code comments in sync
4. **Commits:** Verify no sensitive information before committing
5. **TikTok:** Code exists but is disabled; do not remove unless explicitly requested
6. **Git Push on VM:** VM lacks credential helper; push from local machine instead
