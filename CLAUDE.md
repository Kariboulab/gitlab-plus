# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitLab Plus is a Chrome extension (Manifest V3) that enhances GitLab with productivity features for merge request workflows. It provides quick filters, reviewer presets, and MR list enhancements.

## Project Structure

```
gitlab-plus/
├── manifest.json              # Extension manifest (MV3)
├── icons/                     # Extension icons (16, 48, 128px)
├── src/
│   ├── background/
│   │   └── service-worker.js  # Background service worker for API calls
│   ├── content/
│   │   ├── mr-list.js         # MR list page enhancements
│   │   ├── mr-list.css
│   │   ├── mr-create.js       # MR create/edit page features
│   │   └── mr-create.css
│   ├── options/
│   │   ├── options.html       # Settings page
│   │   ├── options.js
│   │   └── options.css
│   └── popup/
│       ├── popup.html         # Extension popup
│       ├── popup.js
│       └── popup.css
```

## Development Commands

- `npm run lint` - Run ESLint on src/
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run build` - Create distributable zip in dist/
- `npm run clean` - Remove dist/ directory

## Key Technical Details

- **Manifest V3**: Uses service workers instead of background pages
- **Content Scripts**: Injected on `gitlab.com/*` pages
- **Storage**: Uses `chrome.storage.local` for settings and encrypted token storage
- **API Communication**: Content scripts send messages to service worker for GitLab API calls
- **Styling**: Uses GitLab's CSS variables for theme compatibility (light/dark mode)

## GitLab API Integration

The extension requires a GitLab Personal Access Token with scopes:
- `api` - For approving MRs and managing reviewers
- `read_user` - For user search and authentication

API calls are made through the service worker to handle CORS restrictions.

## Code Style

- Vanilla JavaScript (no frameworks/transpilation)
- ESLint for linting
- Follow existing patterns for Chrome extension APIs
- Use CSS variables from GitLab for consistent theming
