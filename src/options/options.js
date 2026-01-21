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

// Filter tag state (for multi-value parameters)
const filterTags = {
  assignee: [],
  label: [],
  search: []
};

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
  // Show add button after loading
  document.getElementById('add-filter-btn').style.display = '';
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
  // Handle array format for authors
  if (filter.params.authors && filter.params.authors.length > 0) {
    parts.push(`Author: ${filter.params.authors.join(', ')}`);
  } else if (filter.params.author_username) {
    parts.push(`Author: ${filter.params.author_username}`);
  }
  // Handle array format for assignees
  if (filter.params.assignees && filter.params.assignees.length > 0) {
    parts.push(`Assignee: ${filter.params.assignees.join(', ')}`);
  } else if (filter.params.assignee_username) {
    parts.push(`Assignee: ${filter.params.assignee_username}`);
  }
  // Handle array format for reviewers
  if (filter.params.reviewers && filter.params.reviewers.length > 0) {
    parts.push(`Reviewer: ${filter.params.reviewers.join(', ')}`);
  } else if (filter.params.reviewer_username) {
    parts.push(`Reviewer: ${filter.params.reviewer_username}`);
  }
  // Handle array format for labels
  if (filter.params.labels && filter.params.labels.length > 0) {
    parts.push(`Labels: ${filter.params.labels.join(', ')}`);
  } else if (filter.params.label_name) {
    parts.push(`Label: ${filter.params.label_name}`);
  }
  if (filter.params.state) {
    parts.push(`State: ${filter.params.state}`);
  }
  if (filter.params.draft) {
    parts.push(`Draft: ${filter.params.draft === 'yes' ? 'Yes' : 'No'}`);
  }
  // Handle array format for search
  if (filter.params.searches && filter.params.searches.length > 0) {
    parts.push(`Search: ${filter.params.searches.map(s => `"${s}"`).join(', ')}`);
  } else if (filter.params.search) {
    parts.push(`Search: "${filter.params.search}"`);
  }
  return parts.join(' | ') || 'No parameters set';
}

// Filter tag management
function renderFilterTags(type) {
  const container = document.getElementById(`filter-${type}-tags`);
  if (!container) {
    return;
  }

  if (filterTags[type].length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = filterTags[type].map((value, index) => `
    <span class="filter-tag" data-type="${type}" data-index="${index}">
      <span>${escapeHtml(value)}</span>
      <span class="remove" data-action="remove-filter-tag">&times;</span>
    </span>
  `).join('');
}

function addFilterTag(type, value) {
  value = value.trim();
  if (!value || filterTags[type].includes(value)) {
    return;
  }
  filterTags[type].push(value);
  renderFilterTags(type);
}

function removeFilterTag(type, index) {
  filterTags[type].splice(index, 1);
  renderFilterTags(type);
}

function clearFilterTags() {
  Object.keys(filterTags).forEach(type => {
    filterTags[type] = [];
    renderFilterTags(type);
  });
}

function openFilterModal(filter = null) {
  const modal = document.getElementById('filter-modal');
  const title = document.getElementById('filter-modal-title');

  editingFilterId = filter ? filter.id : null;
  title.textContent = filter ? 'Edit Filter' : 'Add Filter';

  // Reset filter name
  document.getElementById('filter-name').value = filter?.name || '';

  // Clear all filter tags
  clearFilterTags();

  // Reset all parameter checkboxes, inputs, and tags
  const singleValueParams = ['author', 'reviewer']; // Single value params
  const tagParams = ['assignee', 'label', 'search']; // Multi-value tag params
  const selectParams = {
    state: { inputId: 'filter-state', defaultValue: 'opened' },
    draft: { inputId: 'filter-draft', defaultValue: 'no' }
  };

  // Reset single-value params
  singleValueParams.forEach(id => {
    const checkbox = document.getElementById(`param-${id}-enabled`);
    const inputDiv = document.getElementById(`param-${id}-input`);
    const input = document.getElementById(`filter-${id}`);

    checkbox.checked = false;
    inputDiv.style.display = 'none';
    input.value = '';
  });

  // Reset tag-based params
  tagParams.forEach(id => {
    const checkbox = document.getElementById(`param-${id}-enabled`);
    const inputDiv = document.getElementById(`param-${id}-input`);
    const input = document.getElementById(`filter-${id}`);

    checkbox.checked = false;
    inputDiv.style.display = 'none';
    input.value = '';
  });

  // Reset select-based params
  Object.entries(selectParams).forEach(([id, config]) => {
    const checkbox = document.getElementById(`param-${id}-enabled`);
    const inputDiv = document.getElementById(`param-${id}-input`);
    const input = document.getElementById(config.inputId);

    checkbox.checked = false;
    inputDiv.style.display = 'none';
    input.value = config.defaultValue;
  });

  // If editing, populate from existing filter params
  if (filter && filter.params) {
    // Populate single-value params (author, reviewer)
    const singleMapping = {
      author: { key: 'author_username', arrayKey: 'authors' },
      reviewer: { key: 'reviewer_username', arrayKey: 'reviewers' }
    };

    Object.entries(singleMapping).forEach(([type, keys]) => {
      let value = filter.params[keys.key];
      // Backwards compatibility: get first value from array if present
      if (!value && filter.params[keys.arrayKey] && filter.params[keys.arrayKey].length > 0) {
        value = filter.params[keys.arrayKey][0];
      }
      if (value) {
        const checkbox = document.getElementById(`param-${type}-enabled`);
        const inputDiv = document.getElementById(`param-${type}-input`);
        const input = document.getElementById(`filter-${type}`);
        checkbox.checked = true;
        inputDiv.style.display = 'block';
        input.value = value;
      }
    });

    // Populate tag-based params (assignee, label, search)
    const tagMapping = {
      assignee: { arrayKey: 'assignees', singleKey: 'assignee_username' },
      label: { arrayKey: 'labels', singleKey: 'label_name' },
      search: { arrayKey: 'searches', singleKey: 'search' }
    };

    Object.entries(tagMapping).forEach(([type, keys]) => {
      let values = filter.params[keys.arrayKey];
      // Backwards compatibility with single value format
      if (!values && filter.params[keys.singleKey]) {
        values = [filter.params[keys.singleKey]];
      }
      if (values && values.length > 0) {
        const checkbox = document.getElementById(`param-${type}-enabled`);
        const inputDiv = document.getElementById(`param-${type}-input`);
        checkbox.checked = true;
        inputDiv.style.display = 'block';
        filterTags[type] = [...values];
        renderFilterTags(type);
      }
    });

    // Populate select-based params
    Object.entries(selectParams).forEach(([id, config]) => {
      const paramKey = id; // state, draft
      if (filter.params[paramKey]) {
        const checkbox = document.getElementById(`param-${id}-enabled`);
        const inputDiv = document.getElementById(`param-${id}-input`);
        const input = document.getElementById(config.inputId);
        checkbox.checked = true;
        inputDiv.style.display = 'block';
        input.value = filter.params[paramKey];
      }
    });
  }

  // Hide any open search results
  document.querySelectorAll('.search-results').forEach(el => el.style.display = 'none');

  modal.style.display = 'flex';
}

async function saveFilter() {
  const name = document.getElementById('filter-name').value.trim();

  if (!name) {
    alert('Please enter a filter name');
    return;
  }

  // Build params object from enabled checkboxes and inputs/tags
  const params = {};

  // Single-value params (author, reviewer)
  if (document.getElementById('param-author-enabled').checked) {
    const val = document.getElementById('filter-author').value.trim();
    if (val) {
      params.author_username = val;
    }
  }

  if (document.getElementById('param-reviewer-enabled').checked) {
    const val = document.getElementById('filter-reviewer').value.trim();
    if (val) {
      params.reviewer_username = val;
    }
  }

  // Tag-based params (use arrays)
  if (document.getElementById('param-assignee-enabled').checked && filterTags.assignee.length > 0) {
    params.assignees = [...filterTags.assignee];
  }

  if (document.getElementById('param-label-enabled').checked && filterTags.label.length > 0) {
    params.labels = [...filterTags.label];
  }

  if (document.getElementById('param-search-enabled').checked && filterTags.search.length > 0) {
    params.searches = [...filterTags.search];
  }

  // Select-based params
  if (document.getElementById('param-state-enabled').checked) {
    params.state = document.getElementById('filter-state').value;
  }

  if (document.getElementById('param-draft-enabled').checked) {
    params.draft = document.getElementById('filter-draft').value;
  }

  // Require at least one parameter
  if (Object.keys(params).length === 0) {
    alert('Please enable and configure at least one filter parameter');
    return;
  }

  // Save filter (no type field needed)
  const filter = {
    id: editingFilterId || generateId(),
    name,
    enabled: editingFilterId ? filters.find(f => f.id === editingFilterId)?.enabled ?? true : true,
    order: editingFilterId ? filters.find(f => f.id === editingFilterId)?.order ?? filters.length : filters.length,
    params
  };

  if (editingFilterId) {
    const index = filters.findIndex(f => f.id === editingFilterId);
    if (index !== -1) {
      filters[index] = filter;
    }
  } else {
    filters.push(filter);
  }

  await sendMessage(MessageTypes.SAVE_FILTERS, { filters });
  closeFilterModal();
  renderFilters();
}

function closeFilterModal() {
  document.getElementById('filter-modal').style.display = 'none';
  // Hide all search results dropdowns
  document.querySelectorAll('.search-results').forEach(el => el.style.display = 'none');
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
  // Show add button after loading
  document.getElementById('add-preset-btn').style.display = '';
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
  document.getElementById('pref-copy-link-format').value = preferences.copy_link_format || 'markdown';
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
  preferences.copy_link_format = document.getElementById('pref-copy-link-format').value;
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

  // Parameter checkbox toggle listeners
  const paramIds = ['author', 'assignee', 'reviewer', 'label', 'state', 'draft', 'search'];
  paramIds.forEach(id => {
    document.getElementById(`param-${id}-enabled`).addEventListener('change', (e) => {
      document.getElementById(`param-${id}-input`).style.display = e.target.checked ? 'block' : 'none';
    });
  });

  // Username autocomplete for author, assignee, reviewer fields (with tag support)
  const usernameFields = [
    { inputId: 'filter-author', resultsId: 'author-search-results', tagType: null }, // single value
    { inputId: 'filter-assignee', resultsId: 'assignee-search-results', tagType: 'assignee' },
    { inputId: 'filter-reviewer', resultsId: 'reviewer-search-results', tagType: null } // single value
  ];

  usernameFields.forEach(({ inputId, resultsId, tagType }) => {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);

    input.addEventListener('input', (e) => {
      clearTimeout(usernameSearchTimeout);
      usernameSearchTimeout = setTimeout(() => searchUsers(e.target.value, resultsId), 300);
    });

    // For tag-based fields, add tag on Enter; for single-value fields, just hide results
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val && tagType) {
          // Tag-based: add tag and clear input
          addFilterTag(tagType, val);
          input.value = '';
        }
        // Single-value: just keep the value in input
        results.style.display = 'none';
      }
    });

    // Handle autocomplete selection
    results.addEventListener('click', (e) => {
      const result = e.target.closest('.search-result');
      if (result && result.dataset.username) {
        if (tagType) {
          // Tag-based: add tag and clear input
          addFilterTag(tagType, result.dataset.username);
          input.value = '';
        } else {
          // Single-value: set the input value
          input.value = result.dataset.username;
        }
        results.style.display = 'none';
      }
    });
  });

  // Tag input for labels and search (no autocomplete, just Enter to add)
  const textTagFields = [
    { inputId: 'filter-label', tagType: 'label' },
    { inputId: 'filter-search', tagType: 'search' }
  ];

  textTagFields.forEach(({ inputId, tagType }) => {
    const input = document.getElementById(inputId);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val) {
          addFilterTag(tagType, val);
          input.value = '';
        }
      }
    });
  });

  // Remove filter tags on click
  document.getElementById('filter-modal').addEventListener('click', (e) => {
    if (e.target.dataset.action === 'remove-filter-tag') {
      const tag = e.target.closest('.filter-tag');
      if (tag) {
        removeFilterTag(tag.dataset.type, parseInt(tag.dataset.index));
      }
    }
  });

  // Hide search results when clicking outside
  document.addEventListener('click', (e) => {
    usernameFields.forEach(({ inputId, resultsId }) => {
      const input = document.getElementById(inputId);
      const results = document.getElementById(resultsId);
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.style.display = 'none';
      }
    });
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
