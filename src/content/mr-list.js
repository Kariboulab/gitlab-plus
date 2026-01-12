// GitLab Plus - MR List Page Content Script
// Injects quick filter buttons on merge request list pages

(function () {
  'use strict';

  const MessageTypes = {
    GET_FILTERS: 'GET_FILTERS',
    GET_PREFERENCES: 'GET_PREFERENCES',
    GET_CURRENT_USER: 'GET_CURRENT_USER',
    APPROVE_MR: 'APPROVE_MR',
    UNAPPROVE_MR: 'UNAPPROVE_MR',
    GET_MR_APPROVAL_STATUS: 'GET_MR_APPROVAL_STATUS'
  };

  // URL patterns for MR list pages
  const MR_LIST_PATTERNS = [
    /gitlab\.com\/.*\/-\/merge_requests\/?(\?.*)?$/,
    /gitlab\.com\/dashboard\/merge_requests/,
    /gitlab\.com\/groups\/.*\/-\/merge_requests/
  ];

  // Check if current page is an MR list
  function isMRListPage() {
    return MR_LIST_PATTERNS.some((pattern) =>
      pattern.test(window.location.href)
    );
  }

  // Check if current page is the dashboard MR list (where scope params work)
  function isDashboardPage() {
    return /gitlab\.com\/dashboard\/merge_requests/.test(window.location.href);
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

  // Generate filter URL with proper parameter transformation
  // On dashboard pages, scope params work directly
  // On project/group pages, we need to use explicit username params
  function generateFilterUrl(filter, currentUsername) {
    const url = new URL(window.location.href);
    const onDashboard = isDashboardPage();

    // Clear existing filter params
    const filterParams = [
      'scope',
      'state',
      'author_username',
      'assignee_username',
      'reviewer_username',
      'label_name',
      'label_name[]'
    ];
    filterParams.forEach((param) => url.searchParams.delete(param));

    // Apply new params with transformations
    Object.entries(filter.params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      // Replace @me with actual username
      if (value === '@me' && currentUsername) {
        value = currentUsername;
      }

      // On non-dashboard pages, transform scope params to explicit username params
      if (!onDashboard && key === 'scope' && currentUsername) {
        if (value === 'created_by_me') {
          url.searchParams.set('author_username', currentUsername);
          return;
        } else if (value === 'assigned_to_me') {
          url.searchParams.set('assignee_username', currentUsername);
          return;
        }
      }

      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  // Check if filter is active (considering parameter transformations)
  function isFilterActive(filter, currentUsername) {
    const url = new URL(window.location.href);
    const onDashboard = isDashboardPage();

    return Object.entries(filter.params).every(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return true;
      }

      // Handle @me substitution
      let expectedValue = value;
      if (value === '@me' && currentUsername) {
        expectedValue = currentUsername;
      }

      // On non-dashboard pages, check transformed params
      if (!onDashboard && key === 'scope' && currentUsername) {
        if (value === 'created_by_me') {
          return url.searchParams.get('author_username') === currentUsername;
        } else if (value === 'assigned_to_me') {
          return url.searchParams.get('assignee_username') === currentUsername;
        }
      }

      return url.searchParams.get(key) === expectedValue;
    });
  }

  // Create filter buttons container
  function createFiltersContainer(filters, currentUsername) {
    const container = document.createElement('div');
    container.id = 'gitlab-plus-filters';
    container.className = 'gitlab-plus-filters';

    const label = document.createElement('span');
    label.className = 'gitlab-plus-filters-label';
    label.textContent = 'Quick Filters:';
    container.appendChild(label);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'gitlab-plus-filters-buttons';

    filters
      .filter((f) => f.enabled)
      .forEach((filter) => {
        const button = document.createElement('button');
        button.className = 'gitlab-plus-filter-btn';
        button.textContent = filter.name;
        button.dataset.filterId = filter.id;

        if (isFilterActive(filter, currentUsername)) {
          button.classList.add('active');
        }

        button.addEventListener('click', () => {
          window.location.href = generateFilterUrl(filter, currentUsername);
        });

        buttonsContainer.appendChild(button);
      });

    // Add clear filters button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'gitlab-plus-filter-btn gitlab-plus-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      const filterParams = [
        'scope',
        'state',
        'author_username',
        'assignee_username',
        'reviewer_username',
        'label_name',
        'label_name[]'
      ];
      filterParams.forEach((param) => url.searchParams.delete(param));
      window.location.href = url.toString();
    });
    buttonsContainer.appendChild(clearBtn);

    container.appendChild(buttonsContainer);

    return container;
  }

  // ============ MR List Enhancements ============

  // Get all MR rows on the page
  function getMRRows() {
    return document.querySelectorAll(
      '.merge-request, ' +
      'li[data-id], ' +
      '.issuable-list > li, ' +
      '[data-testid="issuable-container"]'
    );
  }

  // Extract MR info from a row element
  function getMRInfoFromRow(row) {
    // Find the title link
    const titleLink = row.querySelector(
      '.merge-request-title a, ' +
      '.issuable-main-info a, ' +
      '[data-testid="issuable-title"] a, ' +
      '.issue-title-text a'
    );

    if (!titleLink) {
      return null;
    }

    const href = titleLink.getAttribute('href');
    const title = titleLink.textContent.trim();

    // Parse project path and MR IID from URL
    // Format: /group/project/-/merge_requests/123
    const match = href.match(/\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (!match) {
      return null;
    }

    return {
      projectPath: match[1],
      mrIid: match[2],
      title: title,
      url: `https://gitlab.com${href}`,
      titleElement: titleLink
    };
  }

  // Apply draft dimming to MR rows
  function applyDraftDimming() {
    const rows = getMRRows();

    rows.forEach(row => {
      if (row.classList.contains('gitlab-plus-draft-processed')) {
        return;
      }
      row.classList.add('gitlab-plus-draft-processed');

      const mrInfo = getMRInfoFromRow(row);
      if (!mrInfo) {
        return;
      }

      // Check if title starts with Draft: or WIP:
      const isDraft = /^(Draft:|WIP:|\[Draft\]|\[WIP\])/i.test(mrInfo.title);

      if (isDraft) {
        row.classList.add('gitlab-plus-draft');
      }
    });
  }

  // Parse date from GitLab's human-readable format
  // Format: "January 12, 2026 at 10:09:35 AM EST"
  function parseGitLabDate(dateStr) {
    if (!dateStr) {
      return null;
    }
    // Remove "at" to make it parseable by Date constructor
    const cleaned = dateStr.replace(' at ', ' ');
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date;
  }

  // Add age indicators to MR rows
  function addAgeIndicators(staleDays = 7) {
    const rows = getMRRows();

    rows.forEach(row => {
      if (row.querySelector('.gitlab-plus-age-dot')) {
        return;
      }

      // Try new GitLab structure first (button with data-testid)
      let dateEl = row.querySelector('button[data-testid="issuable-created-at"]');
      let created;

      if (dateEl) {
        // New structure: parse date from title attribute
        const titleDate = dateEl.getAttribute('title');
        created = parseGitLabDate(titleDate);
      } else {
        // Fall back to old structure: time element with datetime
        dateEl = row.querySelector('time[datetime]');
        if (dateEl) {
          const datetime = dateEl.getAttribute('datetime');
          created = datetime ? new Date(datetime) : null;
        }
      }

      if (!dateEl || !created) {
        return;
      }
      const now = new Date();
      const ageMs = now - created;
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      // Determine age category
      let ageClass = 'gitlab-plus-age-fresh';
      if (ageDays >= staleDays) {
        ageClass = 'gitlab-plus-age-stale';
      } else if (ageDays >= 3) {
        ageClass = 'gitlab-plus-age-aging';
      }

      // Create dot badge (no text, just colored indicator)
      const badge = document.createElement('span');
      badge.className = `gitlab-plus-age-dot ${ageClass}`;
      badge.title = `Created ${ageDays} day${ageDays !== 1 ? 's' : ''} ago`;

      // Insert badge near the date element
      dateEl.parentNode.insertBefore(badge, dateEl);
    });
  }

  // Add copy link buttons to MR rows (next to the title)
  function addCopyLinkButtons() {
    const rows = getMRRows();

    rows.forEach(row => {
      if (row.querySelector('.gitlab-plus-copy-btn')) {
        return;
      }

      const mrInfo = getMRInfoFromRow(row);
      if (!mrInfo || !mrInfo.titleElement) {
        return;
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'gitlab-plus-copy-btn gitlab-plus-action-btn';
      copyBtn.textContent = 'Copy link';
      copyBtn.title = 'Copy link as markdown';
      copyBtn.type = 'button';

      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const markdown = `[${mrInfo.title}](${mrInfo.url})`;

        try {
          await navigator.clipboard.writeText(markdown);
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copy link';
            copyBtn.classList.remove('copied');
          }, 1500);
        } catch (err) {
          console.error('GitLab Plus: Failed to copy:', err);
          copyBtn.textContent = 'Failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy link';
          }, 1500);
        }
      });

      // Insert after the title element
      mrInfo.titleElement.parentNode.insertBefore(copyBtn, mrInfo.titleElement.nextSibling);
    });
  }

  // Find the controls container in an MR row (assignee, approvals, comments, etc.)
  function findControlsContainer(row) {
    // Try various selectors for the controls area
    const selectors = [
      '.issuable-meta .controls',
      '.controls',
      '.issuable-info .controls',
      '[data-testid="issuable-meta"] .controls',
      '.merge-request-info',
      '.issuable-meta'
    ];

    for (const selector of selectors) {
      const container = row.querySelector(selector);
      if (container) {
        return container;
      }
    }

    return null;
  }

  // Cache for current user (fetched once)
  let cachedCurrentUser = null;
  let currentUserPromise = null;

  async function getCurrentUser() {
    if (cachedCurrentUser) {
      return cachedCurrentUser;
    }
    if (currentUserPromise) {
      return currentUserPromise;
    }

    currentUserPromise = sendMessage(MessageTypes.GET_CURRENT_USER)
      .then(user => {
        cachedCurrentUser = user;
        return user;
      })
      .catch(err => {
        console.error('GitLab Plus: Failed to get current user:', err);
        return null;
      });

    return currentUserPromise;
  }

  // Add quick approve buttons to MR rows (next to controls)
  function addQuickApproveButtons() {
    const rows = getMRRows();

    rows.forEach(row => {
      if (row.querySelector('.gitlab-plus-approve-btn')) {
        return;
      }
      // Mark as processing to avoid duplicate processing
      if (row.dataset.gitlabPlusApproveProcessing) {
        return;
      }
      row.dataset.gitlabPlusApproveProcessing = 'true';

      const mrInfo = getMRInfoFromRow(row);
      if (!mrInfo) {
        delete row.dataset.gitlabPlusApproveProcessing;
        return;
      }

      const controlsContainer = findControlsContainer(row);
      if (!controlsContainer) {
        delete row.dataset.gitlabPlusApproveProcessing;
        return;
      }

      // Create button immediately (don't wait for API)
      const approveBtn = document.createElement('button');
      approveBtn.className = 'gitlab-plus-approve-btn gitlab-plus-action-btn';
      approveBtn.textContent = 'Approve';
      approveBtn.title = 'Approve this MR';
      approveBtn.type = 'button';
      approveBtn.dataset.approved = 'false';
      approveBtn.style.opacity = '0.5'; // Dim until we know the status

      // Append button immediately
      controlsContainer.appendChild(approveBtn);

      // Check user and approval status asynchronously
      (async () => {
        try {
          // Check if current user is the author
          const currentUser = await getCurrentUser();
          if (currentUser) {
            const authorLink = row.querySelector('.author-link, [data-testid="author-link"], .issuable-authored a');
            if (authorLink) {
              const authorHref = authorLink.getAttribute('href') || '';
              const authorUsername = authorHref.split('/').pop();
              if (authorUsername === currentUser.username) {
                approveBtn.remove(); // Remove button on own MRs
                return;
              }
            }
          }

          // Check current approval status
          const status = await sendMessage(MessageTypes.GET_MR_APPROVAL_STATUS, {
            projectPath: mrInfo.projectPath,
            mrIid: mrInfo.mrIid
          });

          if (status.userApproved) {
            approveBtn.textContent = 'Unapprove';
            approveBtn.title = 'Remove your approval';
            approveBtn.dataset.approved = 'true';
            approveBtn.classList.add('approved');
          }
        } catch (err) {
          console.error('GitLab Plus: Failed to get approval status:', err);
        } finally {
          approveBtn.style.opacity = '1'; // Show full opacity once loaded
        }
      })();

      approveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (approveBtn.disabled) {
          return;
        }
        approveBtn.disabled = true;
        approveBtn.classList.add('approving');
        approveBtn.textContent = '...';

        const isApproved = approveBtn.dataset.approved === 'true';

        try {
          if (isApproved) {
            // Unapprove
            await sendMessage(MessageTypes.UNAPPROVE_MR, {
              projectPath: mrInfo.projectPath,
              mrIid: mrInfo.mrIid
            });

            approveBtn.textContent = 'Approve';
            approveBtn.classList.remove('approving', 'approved');
            approveBtn.title = 'Approve this MR';
            approveBtn.dataset.approved = 'false';
          } else {
            // Approve
            await sendMessage(MessageTypes.APPROVE_MR, {
              projectPath: mrInfo.projectPath,
              mrIid: mrInfo.mrIid
            });

            approveBtn.textContent = 'Unapprove';
            approveBtn.classList.remove('approving');
            approveBtn.classList.add('approved');
            approveBtn.title = 'Remove your approval';
            approveBtn.dataset.approved = 'true';
          }

          approveBtn.disabled = false;
        } catch (err) {
          console.error('GitLab Plus: Failed to toggle approval:', err);
          approveBtn.textContent = 'Error';
          approveBtn.classList.remove('approving');
          approveBtn.classList.add('error');
          approveBtn.title = `Error: ${err.message}`;

          setTimeout(() => {
            // Restore previous state
            if (isApproved) {
              approveBtn.textContent = 'Unapprove';
              approveBtn.classList.add('approved');
              approveBtn.title = 'Remove your approval';
            } else {
              approveBtn.textContent = 'Approve';
              approveBtn.title = 'Approve this MR';
            }
            approveBtn.classList.remove('error');
            approveBtn.disabled = false;
          }, 3000);
        }
      });

      // Append to the controls container
      controlsContainer.appendChild(approveBtn);
    });
  }

  // Cached preferences for re-applying enhancements
  let cachedPrefs = null;

  // Apply all MR list enhancements
  async function applyMREnhancements(prefs) {
    if (prefs.enable_draft_dimming !== false) {
      applyDraftDimming();
    }

    if (prefs.enable_age_indicator !== false) {
      addAgeIndicators(prefs.stale_mr_days || 7);
    }

    if (prefs.enable_copy_mr_link !== false) {
      addCopyLinkButtons();
    }

    if (prefs.enable_quick_approve !== false) {
      addQuickApproveButtons();
    }
  }

  // Find injection point in GitLab UI
  function findInjectionPoint() {
    // Primary target: inside the vue-filtered-search-bar-container (flex row)
    const searchBarContainer = document.querySelector(
      '.vue-filtered-search-bar-container'
    );
    if (searchBarContainer) {
      return { element: searchBarContainer, position: 'inside' };
    }

    // Fallback selectors for various GitLab page layouts
    const selectors = [
      '.content-list',
      '.top-area .nav-controls',
      '.nav-controls',
      '.page-title-controls',
      '.top-area',
      '.mr-list',
      '.issuable-list'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return { element, position: 'before' };
      }
    }

    return null;
  }

  // Inject filters into page
  async function injectFilters() {
    try {
      // Check preferences
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      cachedPrefs = prefs; // Cache for re-applying enhancements

      // Apply MR list enhancements (even if filters are disabled)
      await applyMREnhancements(prefs);

      // Check if filters already injected
      if (document.getElementById('gitlab-plus-filters')) {
        return;
      }

      if (!prefs.enable_mr_filters) {
        return;
      }

      // Get filters
      const filters = await sendMessage(MessageTypes.GET_FILTERS);
      if (!filters || filters.length === 0) {
        return;
      }

      // Find injection point
      const injection = findInjectionPoint();
      if (!injection) {
        console.log('GitLab Plus: Could not find injection point for filters');
        return;
      }

      // Get current user for filter parameter transformations
      const currentUser = await getCurrentUser();
      const currentUsername = currentUser?.username || null;

      // Create and inject container
      const container = createFiltersContainer(filters, currentUsername);

      if (injection.position === 'inside') {
        // Append inside the container (at the end)
        injection.element.appendChild(container);
      } else if (injection.position === 'before') {
        injection.element.parentNode.insertBefore(container, injection.element);
      } else {
        injection.element.parentNode.insertBefore(
          container,
          injection.element.nextSibling
        );
      }

      console.log('GitLab Plus: Filters injected successfully');
    } catch (error) {
      console.error('GitLab Plus: Error injecting filters:', error);
    }
  }

  // Handle page changes (SPA navigation)
  function handlePageChange() {
    // Remove existing filters
    const existing = document.getElementById('gitlab-plus-filters');
    if (existing) {
      existing.remove();
    }

    // Check if this is an MR list page and inject
    if (isMRListPage()) {
      // Wait a bit for GitLab's UI to render
      setTimeout(injectFilters, 500);
    }
  }

  // Debounce helper
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Re-apply enhancements (debounced)
  const reapplyEnhancements = debounce(async () => {
    if (!isMRListPage()) {
      return;
    }

    if (!cachedPrefs) {
      try {
        cachedPrefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      } catch (err) {
        console.error('GitLab Plus: Failed to get preferences:', err);
        return;
      }
    }

    await applyMREnhancements(cachedPrefs);
  }, 300);

  // Initialize
  function init() {
    if (!isMRListPage()) {
      return;
    }

    // Initial injection with delay for page load
    setTimeout(injectFilters, 1000);

    // Watch for SPA navigation and dynamic content
    let lastUrl = location.href;
    const observer = new MutationObserver((mutations) => {
      // Check for URL change
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        cachedPrefs = null; // Reset cached prefs on navigation
        handlePageChange();
        return;
      }

      // Check if new MR rows were added
      const hasNewContent = mutations.some(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          return Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) {
              return false;
            }
            // Check if the added node is or contains MR rows
            return node.matches?.('.merge-request, li[data-id], .issuable-list > li, [data-testid="issuable-container"]') ||
                   node.querySelector?.('.merge-request, li[data-id], .issuable-list > li, [data-testid="issuable-container"]');
          });
        }
        return false;
      });

      if (hasNewContent) {
        reapplyEnhancements();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also listen for popstate
    window.addEventListener('popstate', handlePageChange);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
