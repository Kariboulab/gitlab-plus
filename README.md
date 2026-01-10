# GitLab Plus

A Chrome extension that enhances the GitLab experience with productivity features for merge request workflows.

## Features

### Quick Filters
One-click filter buttons on MR list pages to quickly switch between common views:
- My MRs
- Assigned to Me
- Review Requested
- Custom filters (configurable)

### Reviewer Presets
Save and quickly apply reviewer groups when creating or editing merge requests. Perfect for teams with recurring reviewer combinations.

### MR List Enhancements
- **Draft Dimming** - Visually dim Draft/WIP merge requests in the list
- **Age Indicator** - Color-coded badges showing MR age (fresh/aging/stale)
- **Quick Approve** - Approve or unapprove MRs directly from the list
- **Copy MR Link** - Copy markdown-formatted links `[Title](URL)` with one click

All features are optional and can be toggled from the settings page.

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/gitlab-plus.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the cloned repository folder

5. The extension icon should appear in your toolbar

### Configuration

1. Click the extension icon and go to **Settings**

2. Enter your GitLab Personal Access Token with the following scopes:
   - `api` - Required for approving MRs and managing reviewers
   - `read_user` - Required for user search and authentication

3. (Optional) Select a GitLab group to scope user searches

4. Configure your preferred features and filters

## Project Structure

```
gitlab-plus/
├── manifest.json              # Extension manifest (MV3)
├── icons/                     # Extension icons
├── src/
│   ├── background/
│   │   └── service-worker.js  # Background service worker
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

## Development

### Prerequisites
- Google Chrome or Chromium-based browser
- Git

### Local Development

1. Make changes to the source files

2. Go to `chrome://extensions/`

3. Click the refresh icon on the GitLab Plus extension card

4. Test your changes on GitLab

### Building for Production

To create a distributable zip file:

```bash
zip -r gitlab-plus.zip manifest.json icons/ src/ -x "*.DS_Store"
```

## Privacy & Security

- Your GitLab token is encrypted and stored locally in Chrome's storage
- No data is sent to external servers (only GitLab API calls)
- All communication with GitLab uses HTTPS
- The extension only activates on `gitlab.com` pages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the GitLab community
- Uses GitLab's CSS variables for seamless light/dark theme support
