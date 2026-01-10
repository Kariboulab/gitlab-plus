// GitLab Plus Options Page Script

// Message types
const MessageTypes = {
  GET_TOKEN: 'GET_TOKEN',
  SAVE_TOKEN: 'SAVE_TOKEN',
  CLEAR_TOKEN: 'CLEAR_TOKEN',
  VALIDATE_TOKEN: 'VALIDATE_TOKEN',
  GET_CURRENT_USER: 'GET_CURRENT_USER',
  SEARCH_USERS: 'SEARCH_USERS',
  GET_FILTERS: 'GET_FILTERS',
  SAVE_FILTERS: 'SAVE_FILTERS',
  GET_REVIEWER_PRESETS: 'GET_REVIEWER_PRESETS',
  SAVE_REVIEWER_PRESETS: 'SAVE_REVIEWER_PRESETS',
  GET_PREFERENCES: 'GET_PREFERENCES',
  SAVE_PREFERENCES: 'SAVE_PREFERENCES',
  GET_GITLAB_GROUP: 'GET_GITLAB_GROUP',
  SAVE_GITLAB_GROUP: 'SAVE_GITLAB_GROUP',
  GET_USER_GROUPS: 'GET_USER_GROUPS'
};

// State
let filters = [];
let presets = [];
let preferences = {};
let editingFilterId = null;
let editingPresetId = null;
let selectedReviewers = [];

// Send message to background script
async function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// Generate UUID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadTokenStatus();
  await loadFilters();
  await loadPresets();
  await loadPreferences();
  setupEventListeners();
});

// Token Management
async function loadTokenStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const userInfo = document.getElementById('user-info');
  const clearBtn = document.getElementById('clear-btn');

  statusIndicator.className = 'status-indicator loading';
  statusText.textContent = 'Checking...';

  try {
    const user = await sendMessage(MessageTypes.GET_CURRENT_USER);

    if (user) {
      statusIndicator.className = 'status-indicator connected';
      statusText.textContent = 'Connected';

      document.getElementById('user-avatar').src = user.avatar_url;
      document.getElementById('user-name').textContent = user.name;
      document.getElementById('user-username').textContent = `@${user.username}`;
      userInfo.style.display = 'flex';
      clearBtn.style.display = 'block';

      // Load groups when connected
      await loadGroups();
    } else {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'Not configured';
      userInfo.style.display = 'none';
      clearBtn.style.display = 'none';

      // Reset group dropdown
      const groupSelect = document.getElementById('gitlab-group');
      groupSelect.innerHTML = '<option value="">-- Configure token first --</option>';
      groupSelect.disabled = true;
    }
  } catch (error) {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'Error checking status';
  }
}

async function validateAndSaveToken() {
  const tokenInput = document.getElementById('token-input');
  const validateBtn = document.getElementById('validate-btn');
  const errorDiv = document.getElementById('token-error');

  const token = tokenInput.value.trim();
  if (!token) {
    errorDiv.textContent = 'Please enter a token';
    errorDiv.style.display = 'block';
    return;
  }

  validateBtn.disabled = true;
  validateBtn.textContent = 'Validating...';
  errorDiv.style.display = 'none';

  try {
    const result = await sendMessage(MessageTypes.VALIDATE_TOKEN, { token });

    if (result.valid) {
      await sendMessage(MessageTypes.SAVE_TOKEN, { token });
      tokenInput.value = '';
      await loadTokenStatus();
    } else {
      errorDiv.textContent = 'Invalid token. Please check and try again.';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = `Error: ${error.message}`;
    errorDiv.style.display = 'block';
  } finally {
    validateBtn.disabled = false;
    validateBtn.textContent = 'Validate & Save';
  }
}

async function clearToken() {
  if (confirm('Are you sure you want to clear your token?')) {
    await sendMessage(MessageTypes.CLEAR_TOKEN);
    await loadTokenStatus();
  }
}

// Groups Management
async function loadGroups() {
  const groupSelect = document.getElementById('gitlab-group');

  try {
    const groups = await sendMessage(MessageTypes.GET_USER_GROUPS);
    const savedGroup = await sendMessage(MessageTypes.GET_GITLAB_GROUP);

    groupSelect.innerHTML = '<option value="">-- Select a group --</option>';

    if (groups && groups.length > 0) {
      groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.full_path;
        if (savedGroup && savedGroup === group.id) {
          option.selected = true;
        }
        groupSelect.appendChild(option);
      });
      groupSelect.disabled = false;
    } else {
      groupSelect.innerHTML = '<option value="">-- No groups found --</option>';
    }
  } catch (error) {
    console.error('Failed to load groups:', error);
    groupSelect.innerHTML = '<option value="">-- Error loading groups --</option>';
  }
}

async function saveGroup() {
  const groupSelect = document.getElementById('gitlab-group');
  const groupId = groupSelect.value;

  try {
    await sendMessage(MessageTypes.SAVE_GITLAB_GROUP, { groupId: groupId || null });
  } catch (error) {
    console.error('Failed to save group:', error);
  }
}

// Filters Management
async function loadFilters() {
  filters = await sendMessage(MessageTypes.GET_FILTERS);
  renderFilters();
}

function renderFilters() {
  const list = document.getElementById('filters-list');

  if (filters.length === 0) {
    list.innerHTML = '<div class="empty-state">No filters configured</div>';
    return;
  }

  list.innerHTML = filters
    .sort((a, b) => a.order - b.order)
    .map(filter => `
      <div class="item" data-id="${filter.id}">
        <div class="item-info">
          <div class="item-toggle ${filter.enabled ? 'active' : ''}" data-action="toggle"></div>
          <div>
            <div class="item-name">${escapeHtml(filter.name)}</div>
            <div class="item-meta">${getFilterDescription(filter)}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary" data-action="edit">Edit</button>
          <button class="btn btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `).join('');
}

function getFilterDescription(filter) {
  const parts = [];
  if (filter.params.scope) {
    parts.push(`Scope: ${filter.params.scope}`);
  }
  if (filter.params.author_username) {
    parts.push(`Author: ${filter.params.author_username}`);
  }
  if (filter.params.assignee_username) {
    parts.push(`Assignee: ${filter.params.assignee_username}`);
  }
  if (filter.params.reviewer_username) {
    parts.push(`Reviewer: ${filter.params.reviewer_username}`);
  }
  if (filter.params.label_name) {
    parts.push(`Label: ${filter.params.label_name}`);
  }
  if (filter.params.state) {
    parts.push(`State: ${filter.params.state}`);
  }
  return parts.join(' | ');
}

function openFilterModal(filter = null) {
  const modal = document.getElementById('filter-modal');
  const title = document.getElementById('filter-modal-title');

  editingFilterId = filter ? filter.id : null;
  title.textContent = filter ? 'Edit Filter' : 'Add Filter';

  // Reset form
  document.getElementById('filter-name').value = filter?.name || '';
  document.getElementById('filter-type').value = filter?.type || 'scope';
  document.getElementById('filter-scope').value = filter?.params.scope || 'created_by_me';
  document.getElementById('filter-username').value =
    filter?.params.author_username ||
    filter?.params.assignee_username ||
    filter?.params.reviewer_username || '';
  document.getElementById('filter-label').value = filter?.params.label_name || '';
  document.getElementById('filter-state').value = filter?.params.state || 'opened';

  updateFilterTypeFields();
  modal.style.display = 'flex';
}

function updateFilterTypeFields() {
  const type = document.getElementById('filter-type').value;
  const scopeGroup = document.getElementById('scope-group');
  const usernameGroup = document.getElementById('username-group');
  const labelGroup = document.getElementById('label-group');

  scopeGroup.style.display = type === 'scope' ? 'block' : 'none';
  usernameGroup.style.display = ['author', 'assignee', 'reviewer'].includes(type) ? 'block' : 'none';
  labelGroup.style.display = type === 'label' ? 'block' : 'none';
}

async function saveFilter() {
  const name = document.getElementById('filter-name').value.trim();
  const type = document.getElementById('filter-type').value;
  const state = document.getElementById('filter-state').value;

  if (!name) {
    alert('Please enter a filter name');
    return;
  }

  const params = { state };

  if (type === 'scope') {
    params.scope = document.getElementById('filter-scope').value;
  } else if (type === 'author') {
    params.author_username = document.getElementById('filter-username').value.trim();
  } else if (type === 'assignee') {
    params.assignee_username = document.getElementById('filter-username').value.trim();
  } else if (type === 'reviewer') {
    params.reviewer_username = document.getElementById('filter-username').value.trim();
  } else if (type === 'label') {
    params.label_name = document.getElementById('filter-label').value.trim();
  }

  if (editingFilterId) {
    const index = filters.findIndex(f => f.id === editingFilterId);
    if (index !== -1) {
      filters[index] = { ...filters[index], name, type, params };
    }
  } else {
    filters.push({
      id: generateId(),
      name,
      type,
      enabled: true,
      order: filters.length,
      params
    });
  }

  await sendMessage(MessageTypes.SAVE_FILTERS, { filters });
  closeFilterModal();
  renderFilters();
}

function closeFilterModal() {
  document.getElementById('filter-modal').style.display = 'none';
  document.getElementById('username-search-results').style.display = 'none';
  editingFilterId = null;
}

async function toggleFilter(id) {
  const filter = filters.find(f => f.id === id);
  if (filter) {
    filter.enabled = !filter.enabled;
    await sendMessage(MessageTypes.SAVE_FILTERS, { filters });
    renderFilters();
  }
}

async function deleteFilter(id) {
  if (confirm('Are you sure you want to delete this filter?')) {
    filters = filters.filter(f => f.id !== id);
    await sendMessage(MessageTypes.SAVE_FILTERS, { filters });
    renderFilters();
  }
}

// Presets Management
async function loadPresets() {
  presets = await sendMessage(MessageTypes.GET_REVIEWER_PRESETS);
  renderPresets();
}

function renderPresets() {
  const list = document.getElementById('presets-list');

  if (presets.length === 0) {
    list.innerHTML = '<div class="empty-state">No reviewer presets configured</div>';
    return;
  }

  list.innerHTML = presets
    .sort((a, b) => a.order - b.order)
    .map(preset => `
      <div class="item" data-id="${preset.id}">
        <div class="item-info">
          <div class="item-toggle ${preset.enabled ? 'active' : ''}" data-action="toggle"></div>
          <div>
            <div class="item-name">${escapeHtml(preset.name)}</div>
            <div class="item-meta">${preset.reviewers.length} reviewer(s): ${preset.reviewers.map(r => r.username).join(', ')}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary" data-action="edit">Edit</button>
          <button class="btn btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `).join('');
}

function openPresetModal(preset = null) {
  const modal = document.getElementById('preset-modal');
  const title = document.getElementById('preset-modal-title');

  editingPresetId = preset ? preset.id : null;
  title.textContent = preset ? 'Edit Reviewer Preset' : 'Add Reviewer Preset';

  document.getElementById('preset-name').value = preset?.name || '';
  selectedReviewers = preset?.reviewers ? [...preset.reviewers] : [];
  renderSelectedReviewers();

  modal.style.display = 'flex';
}

function renderSelectedReviewers() {
  const container = document.getElementById('selected-reviewers');

  if (selectedReviewers.length === 0) {
    container.innerHTML = '<span class="empty-state">No reviewers selected</span>';
    return;
  }

  container.innerHTML = selectedReviewers.map(r => `
    <div class="reviewer-tag" data-username="${r.username}">
      <img src="${r.avatar_url || 'https://gitlab.com/assets/no_avatar-849f9c04a3a0d0cea2424ae97b27447e.png'}" alt="">
      <span>${escapeHtml(r.display_name || r.username)}</span>
      <span class="remove" data-action="remove-reviewer">&times;</span>
    </div>
  `).join('');
}

let searchTimeout;
let usernameSearchTimeout;

// Generic user search function
async function searchUsers(query, resultsElementId, _onSelect) {
  const results = document.getElementById(resultsElementId);

  if (!query || query.length < 2) {
    results.style.display = 'none';
    return;
  }

  try {
    const users = await sendMessage(MessageTypes.SEARCH_USERS, { query });
    if (users && users.length > 0) {
      results.innerHTML = users.map(u => `
        <div class="search-result" data-username="${u.username}" data-id="${u.id}" data-name="${escapeHtml(u.name)}" data-avatar="${u.avatar_url}">
          <img src="${u.avatar_url}" alt="">
          <span>${escapeHtml(u.name)} (@${u.username})</span>
        </div>
      `).join('');
      results.style.display = 'block';
    } else {
      results.innerHTML = '<div class="search-result">No users found</div>';
      results.style.display = 'block';
    }
  } catch (error) {
    results.innerHTML = '<div class="search-result">Error searching users. Is your token configured?</div>';
    results.style.display = 'block';
  }
}

async function searchReviewers(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchUsers(query, 'search-results'), 300);
}

async function searchFilterUsername(query) {
  clearTimeout(usernameSearchTimeout);
  usernameSearchTimeout = setTimeout(() => searchUsers(query, 'username-search-results'), 300);
}

function selectFilterUsername(username) {
  document.getElementById('filter-username').value = username;
  document.getElementById('username-search-results').style.display = 'none';
}

function addReviewer(username, userId, displayName, avatarUrl) {
  if (selectedReviewers.find(r => r.username === username)) {
    return;
  }

  selectedReviewers.push({
    username,
    user_id: parseInt(userId),
    display_name: displayName,
    avatar_url: avatarUrl
  });

  renderSelectedReviewers();
  document.getElementById('reviewer-search').value = '';
  document.getElementById('search-results').style.display = 'none';
}

function removeReviewer(username) {
  selectedReviewers = selectedReviewers.filter(r => r.username !== username);
  renderSelectedReviewers();
}

async function savePreset() {
  const name = document.getElementById('preset-name').value.trim();

  if (!name) {
    alert('Please enter a preset name');
    return;
  }

  if (selectedReviewers.length === 0) {
    alert('Please add at least one reviewer');
    return;
  }

  if (editingPresetId) {
    const index = presets.findIndex(p => p.id === editingPresetId);
    if (index !== -1) {
      presets[index] = { ...presets[index], name, reviewers: selectedReviewers };
    }
  } else {
    presets.push({
      id: generateId(),
      name,
      enabled: true,
      order: presets.length,
      reviewers: selectedReviewers
    });
  }

  await sendMessage(MessageTypes.SAVE_REVIEWER_PRESETS, { presets });
  closePresetModal();
  renderPresets();
}

function closePresetModal() {
  document.getElementById('preset-modal').style.display = 'none';
  editingPresetId = null;
  selectedReviewers = [];
}

async function togglePreset(id) {
  const preset = presets.find(p => p.id === id);
  if (preset) {
    preset.enabled = !preset.enabled;
    await sendMessage(MessageTypes.SAVE_REVIEWER_PRESETS, { presets });
    renderPresets();
  }
}

async function deletePreset(id) {
  if (confirm('Are you sure you want to delete this preset?')) {
    presets = presets.filter(p => p.id !== id);
    await sendMessage(MessageTypes.SAVE_REVIEWER_PRESETS, { presets });
    renderPresets();
  }
}

// Preferences
async function loadPreferences() {
  preferences = await sendMessage(MessageTypes.GET_PREFERENCES);

  // Core features
  document.getElementById('pref-enable-filters').checked = preferences.enable_mr_filters;
  document.getElementById('pref-enable-presets').checked = preferences.enable_reviewer_presets;

  // MR list enhancements
  document.getElementById('pref-enable-draft-dimming').checked = preferences.enable_draft_dimming !== false;
  document.getElementById('pref-enable-age-indicator').checked = preferences.enable_age_indicator !== false;
  document.getElementById('pref-enable-quick-approve').checked = preferences.enable_quick_approve !== false;
  document.getElementById('pref-enable-copy-mr-link').checked = preferences.enable_copy_mr_link !== false;
  document.getElementById('pref-stale-mr-days').value = preferences.stale_mr_days || 7;
}

async function savePreferences() {
  // Core features
  preferences.enable_mr_filters = document.getElementById('pref-enable-filters').checked;
  preferences.enable_reviewer_presets = document.getElementById('pref-enable-presets').checked;

  // MR list enhancements
  preferences.enable_draft_dimming = document.getElementById('pref-enable-draft-dimming').checked;
  preferences.enable_age_indicator = document.getElementById('pref-enable-age-indicator').checked;
  preferences.enable_quick_approve = document.getElementById('pref-enable-quick-approve').checked;
  preferences.enable_copy_mr_link = document.getElementById('pref-enable-copy-mr-link').checked;
  preferences.stale_mr_days = parseInt(document.getElementById('pref-stale-mr-days').value) || 7;

  await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences });
  alert('Preferences saved!');
}

// Event Listeners
function setupEventListeners() {
  // Token
  document.getElementById('validate-btn').addEventListener('click', validateAndSaveToken);
  document.getElementById('clear-btn').addEventListener('click', clearToken);
  document.getElementById('toggle-visibility').addEventListener('click', () => {
    const input = document.getElementById('token-input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('token-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      validateAndSaveToken();
    }
  });

  // Group selection
  document.getElementById('gitlab-group').addEventListener('change', saveGroup);

  // Filters
  document.getElementById('add-filter-btn').addEventListener('click', () => openFilterModal());
  document.getElementById('filter-save-btn').addEventListener('click', saveFilter);
  document.getElementById('filter-cancel-btn').addEventListener('click', closeFilterModal);
  document.getElementById('filter-type').addEventListener('change', updateFilterTypeFields);

  // Username autocomplete for filters
  document.getElementById('filter-username').addEventListener('input', (e) => {
    searchFilterUsername(e.target.value);
  });

  document.getElementById('username-search-results').addEventListener('click', (e) => {
    const result = e.target.closest('.search-result');
    if (result && result.dataset.username) {
      selectFilterUsername(result.dataset.username);
    }
  });

  // Hide username results when clicking outside
  document.addEventListener('click', (e) => {
    const usernameResults = document.getElementById('username-search-results');
    const usernameInput = document.getElementById('filter-username');
    if (!usernameInput.contains(e.target) && !usernameResults.contains(e.target)) {
      usernameResults.style.display = 'none';
    }
  });

  document.getElementById('filters-list').addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item) {
      return;
    }
    const id = item.dataset.id;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

    if (action === 'toggle') {
      toggleFilter(id);
    } else if (action === 'edit') {
      openFilterModal(filters.find(f => f.id === id));
    } else if (action === 'delete') {
      deleteFilter(id);
    }
  });

  // Presets
  document.getElementById('add-preset-btn').addEventListener('click', () => openPresetModal());
  document.getElementById('preset-save-btn').addEventListener('click', savePreset);
  document.getElementById('preset-cancel-btn').addEventListener('click', closePresetModal);

  document.getElementById('reviewer-search').addEventListener('input', (e) => {
    searchReviewers(e.target.value);
  });

  document.getElementById('search-results').addEventListener('click', (e) => {
    const result = e.target.closest('.search-result');
    if (result && result.dataset.username) {
      addReviewer(result.dataset.username, result.dataset.id, result.dataset.name, result.dataset.avatar);
    }
  });

  document.getElementById('selected-reviewers').addEventListener('click', (e) => {
    if (e.target.dataset.action === 'remove-reviewer') {
      const tag = e.target.closest('.reviewer-tag');
      if (tag) {
        removeReviewer(tag.dataset.username);
      }
    }
  });

  document.getElementById('presets-list').addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item) {
      return;
    }
    const id = item.dataset.id;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

    if (action === 'toggle') {
      togglePreset(id);
    } else if (action === 'edit') {
      openPresetModal(presets.find(p => p.id === id));
    } else if (action === 'delete') {
      deletePreset(id);
    }
  });

  // Preferences
  document.getElementById('save-prefs-btn').addEventListener('click', savePreferences);

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
}

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
