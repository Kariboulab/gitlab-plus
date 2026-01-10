// GitLab Plus - MR Create/Edit Page Content Script
// Injects reviewer preset buttons on merge request creation pages

(function() {
  'use strict';

  const MessageTypes = {
    GET_REVIEWER_PRESETS: 'GET_REVIEWER_PRESETS',
    GET_PREFERENCES: 'GET_PREFERENCES',
    ADD_REVIEWERS_TO_MR: 'ADD_REVIEWERS_TO_MR'
  };

  const PENDING_REVIEWERS_KEY = 'gitlab_plus_pending_reviewers';

  // URL patterns for MR pages
  const MR_NEW_PATTERN = /gitlab\.com\/(.+?)\/-\/merge_requests\/new/;
  const MR_EDIT_PATTERN = /gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)\/edit/;
  const MR_SHOW_PATTERN = /gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)(?:\/.*)?$/;

  // Check if current page is MR create/edit
  function isMRCreatePage() {
    return MR_NEW_PATTERN.test(window.location.href) || MR_EDIT_PATTERN.test(window.location.href);
  }

  // Check if current page is MR show page (after creation)
  function isMRShowPage() {
    return MR_SHOW_PATTERN.test(window.location.href) && !MR_EDIT_PATTERN.test(window.location.href);
  }

  // Get project path and MR IID from URL
  function getMRInfoFromUrl() {
    const editMatch = window.location.href.match(MR_EDIT_PATTERN);
    if (editMatch) {
      return { projectPath: editMatch[1], mrIid: editMatch[2], isNew: false };
    }

    const newMatch = window.location.href.match(MR_NEW_PATTERN);
    if (newMatch) {
      return { projectPath: newMatch[1], mrIid: null, isNew: true };
    }

    const showMatch = window.location.href.match(MR_SHOW_PATTERN);
    if (showMatch) {
      return { projectPath: showMatch[1], mrIid: showMatch[2], isNew: false };
    }

    return null;
  }

  // Send message to background script
  async function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  // Find the reviewer field/block (for injection point)
  function findReviewerField() {
    const selectors = [
      '[data-testid="sidebar-reviewers"]',
      '[data-testid="reviewers-block"]',
      '.block.reviewer',
      '.js-reviewer-search'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    // Try finding by text content in sidebar
    const sidebarBlocks = document.querySelectorAll('.block, [data-testid]');
    for (const block of sidebarBlocks) {
      const text = block.textContent || '';
      if (text.includes('Reviewer')) {
        return block;
      }
    }

    return null;
  }

  // Add reviewers via API (for existing MRs)
  async function addReviewersViaApi(projectPath, mrIid, reviewerIds) {
    console.log('GitLab Plus: Adding reviewers via API:', { projectPath, mrIid, reviewerIds });

    try {
      const result = await sendMessage(MessageTypes.ADD_REVIEWERS_TO_MR, {
        projectPath,
        mrIid,
        reviewerIds
      });
      console.log('GitLab Plus: API result:', result);
      return true;
    } catch (error) {
      console.error('GitLab Plus: API error:', error);
      throw error;
    }
  }

  // Store pending reviewers for after MR creation
  function storePendingReviewers(projectPath, reviewerIds, presetName) {
    const data = { projectPath, reviewerIds, presetName, timestamp: Date.now() };
    sessionStorage.setItem(PENDING_REVIEWERS_KEY, JSON.stringify(data));
    console.log('GitLab Plus: Stored pending reviewers:', data);
  }

  // Get and clear pending reviewers
  function getPendingReviewers() {
    const data = sessionStorage.getItem(PENDING_REVIEWERS_KEY);
    if (!data) return null;

    sessionStorage.removeItem(PENDING_REVIEWERS_KEY);
    const parsed = JSON.parse(data);

    // Only use if stored within last 5 minutes
    if (Date.now() - parsed.timestamp > 5 * 60 * 1000) {
      console.log('GitLab Plus: Pending reviewers expired');
      return null;
    }

    return parsed;
  }

  // Apply preset - either via API or store for later
  async function applyPreset(preset, container) {
    const mrInfo = getMRInfoFromUrl();
    if (!mrInfo) {
      console.error('GitLab Plus: Could not get MR info from URL');
      return;
    }

    const reviewerIds = preset.reviewers.map(r => r.user_id);
    const buttons = container.querySelectorAll('.gitlab-plus-preset-btn');
    const statusEl = container.querySelector('.gitlab-plus-presets-status');

    // Show loading state
    buttons.forEach(btn => btn.disabled = true);

    try {
      if (mrInfo.isNew) {
        // For new MRs, store the preset to apply after creation
        storePendingReviewers(mrInfo.projectPath, reviewerIds, preset.name);

        if (statusEl) {
          statusEl.textContent = `✓ "${preset.name}" will be added after you create the MR`;
          statusEl.className = 'gitlab-plus-presets-status success';
        }
      } else {
        // For existing MRs, use the API directly
        if (statusEl) {
          statusEl.textContent = 'Adding reviewers...';
          statusEl.className = 'gitlab-plus-presets-status loading';
        }

        await addReviewersViaApi(mrInfo.projectPath, mrInfo.mrIid, reviewerIds);

        if (statusEl) {
          statusEl.textContent = `✓ Added ${preset.reviewers.length} reviewers`;
          statusEl.className = 'gitlab-plus-presets-status success';
        }

        // Reload the page to show updated reviewers
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      console.error('GitLab Plus: Error applying preset:', error);
      if (statusEl) {
        statusEl.textContent = `✗ Error: ${error.message}`;
        statusEl.className = 'gitlab-plus-presets-status error';
      }
    } finally {
      buttons.forEach(btn => btn.disabled = false);
    }
  }

  // Check and apply pending reviewers after MR creation
  async function checkPendingReviewers() {
    if (!isMRShowPage()) return;

    const pending = getPendingReviewers();
    if (!pending) return;

    const mrInfo = getMRInfoFromUrl();
    if (!mrInfo || !mrInfo.mrIid) return;

    // Check if we're on the same project
    if (!mrInfo.projectPath.includes(pending.projectPath) && !pending.projectPath.includes(mrInfo.projectPath)) {
      console.log('GitLab Plus: Project path mismatch, skipping pending reviewers');
      return;
    }

    console.log('GitLab Plus: Applying pending reviewers:', pending);

    try {
      await addReviewersViaApi(mrInfo.projectPath, mrInfo.mrIid, pending.reviewerIds);

      // Show a brief notification
      showNotification(`Added reviewers from "${pending.presetName}"`);

      // Reload to show the reviewers
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('GitLab Plus: Error applying pending reviewers:', error);
      showNotification(`Error adding reviewers: ${error.message}`, true);
    }
  }

  // Show a brief notification
  function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'gitlab-plus-notification' + (isError ? ' error' : '');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${isError ? '#dd2b0e' : '#108548'};
      color: white;
      border-radius: 4px;
      z-index: 99999;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // Create preset buttons container
  function createPresetsContainer(presets) {
    const mrInfo = getMRInfoFromUrl();
    const isNewMR = mrInfo && mrInfo.isNew;

    const container = document.createElement('div');
    container.id = 'gitlab-plus-presets';
    container.className = 'gitlab-plus-presets';

    const header = document.createElement('div');
    header.className = 'gitlab-plus-presets-header';

    const label = document.createElement('span');
    label.className = 'gitlab-plus-presets-label';
    label.textContent = 'Quick Add Reviewers:';
    header.appendChild(label);

    container.appendChild(header);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'gitlab-plus-presets-buttons';

    presets.filter(p => p.enabled).forEach(preset => {
      const button = document.createElement('button');
      button.className = 'gitlab-plus-preset-btn';
      button.type = 'button'; // Prevent form submission
      button.dataset.presetId = preset.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'preset-name';
      nameSpan.textContent = preset.name;
      button.appendChild(nameSpan);

      const countSpan = document.createElement('span');
      countSpan.className = 'preset-count';
      countSpan.textContent = `(${preset.reviewers.length})`;
      button.appendChild(countSpan);

      // Show reviewers on hover
      button.title = preset.reviewers.map(r => r.display_name || r.username).join(', ');

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyPreset(preset, container);
      });

      buttonsContainer.appendChild(button);
    });

    container.appendChild(buttonsContainer);

    // Add status element
    const status = document.createElement('div');
    status.className = 'gitlab-plus-presets-status';
    container.appendChild(status);

    // Add help text
    const help = document.createElement('div');
    help.className = 'gitlab-plus-presets-help';
    help.textContent = isNewMR
      ? 'Select a preset - reviewers will be added automatically after you create the MR'
      : 'Click a preset to add all reviewers from that group';
    container.appendChild(help);

    return container;
  }

  // Find injection point for presets
  function findPresetsInjectionPoint() {
    // Look for the reviewer sidebar block
    const reviewerField = findReviewerField();
    if (reviewerField) {
      return { element: reviewerField, position: 'before' };
    }

    // Try finding the assignee field and inject after it
    const assigneeBlock = document.querySelector(
      '[data-testid="assignees-block"], ' +
      '.block.assignee, ' +
      '.js-assignee-search'
    );
    if (assigneeBlock) {
      return { element: assigneeBlock, position: 'after' };
    }

    // Fallback to sidebar
    const sidebar = document.querySelector('.issuable-sidebar, .right-sidebar');
    if (sidebar) {
      return { element: sidebar.firstChild, position: 'before' };
    }

    return null;
  }

  // Inject presets into page
  async function injectPresets() {
    // Check if already injected
    if (document.getElementById('gitlab-plus-presets')) {
      return;
    }

    try {
      // Check preferences
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      if (!prefs.enable_reviewer_presets) {
        return;
      }

      // Get presets
      const presets = await sendMessage(MessageTypes.GET_REVIEWER_PRESETS);
      if (!presets || presets.length === 0) {
        console.log('GitLab Plus: No reviewer presets configured');
        return;
      }

      // Find injection point
      const injection = findPresetsInjectionPoint();
      if (!injection) {
        console.log('GitLab Plus: Could not find injection point for presets');
        return;
      }

      // Create and inject container
      const container = createPresetsContainer(presets);

      if (injection.position === 'before') {
        injection.element.parentNode.insertBefore(container, injection.element);
      } else {
        injection.element.parentNode.insertBefore(container, injection.element.nextSibling);
      }

      console.log('GitLab Plus: Reviewer presets injected successfully');
    } catch (error) {
      console.error('GitLab Plus: Error injecting presets:', error);
    }
  }

  // Handle page changes
  function handlePageChange() {
    const existing = document.getElementById('gitlab-plus-presets');
    if (existing) {
      existing.remove();
    }

    if (isMRCreatePage()) {
      setTimeout(injectPresets, 1000);
    }
  }

  // Initialize
  function init() {
    // Check for pending reviewers on any MR page
    if (isMRShowPage()) {
      setTimeout(checkPendingReviewers, 1000);
    }

    if (!isMRCreatePage()) {
      return;
    }

    // Initial injection with delay
    setTimeout(injectPresets, 1500);

    // Watch for SPA navigation
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handlePageChange();

        // Check for pending reviewers when navigating to MR show page
        if (isMRShowPage()) {
          setTimeout(checkPendingReviewers, 1000);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('popstate', handlePageChange);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
