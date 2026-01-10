// Background service worker for GitLab Plus extension
// Handles message passing, token management, and API coordination

// ============ Constants ============
const StorageKeys = {
  TOKEN_ENCRYPTED: 'gitlab_token_encrypted',
  QUICK_FILTERS: 'quick_filters',
  REVIEWER_PRESETS: 'reviewer_presets',
  PREFERENCES: 'preferences',
  CACHED_USER: 'cached_user',
  GITLAB_GROUP: 'gitlab_group'
};

const DEFAULT_FILTERS = [
  {
    id: 'default-my-mrs',
    name: 'My MRs',
    type: 'scope',
    enabled: true,
    order: 0,
    params: { scope: 'created_by_me', state: 'opened' }
  },
  {
    id: 'default-assigned-to-me',
    name: 'Assigned to Me',
    type: 'scope',
    enabled: true,
    order: 1,
    params: { scope: 'assigned_to_me', state: 'opened' }
  },
  {
    id: 'default-review-requested',
    name: 'Review Requested',
    type: 'reviewer',
    enabled: true,
    order: 2,
    params: { reviewer_username: '@me', state: 'opened' }
  }
];

const DEFAULT_PREFERENCES = {
  show_filters_collapsed: false,
  filter_button_style: 'full',
  enable_mr_filters: true,
  enable_reviewer_presets: true,
  cache_duration_hours: 24,
  // New MR list enhancements
  enable_draft_dimming: true,
  enable_age_indicator: true,
  enable_quick_approve: true,
  enable_copy_mr_link: true,
  stale_mr_days: 7
};

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
  GET_USER_GROUPS: 'GET_USER_GROUPS',
  OPEN_OPTIONS: 'OPEN_OPTIONS',
  ADD_REVIEWERS_TO_MR: 'ADD_REVIEWERS_TO_MR',
  APPROVE_MR: 'APPROVE_MR',
  UNAPPROVE_MR: 'UNAPPROVE_MR',
  GET_MR_APPROVAL_STATUS: 'GET_MR_APPROVAL_STATUS'
};

const GITLAB_API_BASE = 'https://gitlab.com/api/v4';

// ============ Storage ============
const Storage = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async remove(key) {
    await chrome.storage.local.remove(key);
  },

  async getSession(key) {
    const result = await chrome.storage.session.get(key);
    return result[key];
  },

  async setSession(key, value) {
    await chrome.storage.session.set({ [key]: value });
  },

  async removeSession(key) {
    await chrome.storage.session.remove(key);
  },

  async getEncryptedToken() {
    return await this.get(StorageKeys.TOKEN_ENCRYPTED);
  },

  async setEncryptedToken(encryptedData) {
    await this.set(StorageKeys.TOKEN_ENCRYPTED, encryptedData);
  },

  async clearToken() {
    await this.remove(StorageKeys.TOKEN_ENCRYPTED);
    await this.removeSession('encryption_key');
  },

  async getFilters() {
    const filters = await this.get(StorageKeys.QUICK_FILTERS);
    return filters || DEFAULT_FILTERS;
  },

  async setFilters(filters) {
    await this.set(StorageKeys.QUICK_FILTERS, filters);
  },

  async getReviewerPresets() {
    const presets = await this.get(StorageKeys.REVIEWER_PRESETS);
    return presets || [];
  },

  async setReviewerPresets(presets) {
    await this.set(StorageKeys.REVIEWER_PRESETS, presets);
  },

  async getPreferences() {
    const prefs = await this.get(StorageKeys.PREFERENCES);
    return { ...DEFAULT_PREFERENCES, ...prefs };
  },

  async setPreferences(prefs) {
    await this.set(StorageKeys.PREFERENCES, prefs);
  },

  async getCachedUser() {
    return await this.get(StorageKeys.CACHED_USER);
  },

  async setCachedUser(user) {
    await this.set(StorageKeys.CACHED_USER, { ...user, fetched_at: Date.now() });
  },

  async clearCachedUser() {
    await this.remove(StorageKeys.CACHED_USER);
  },

  async getGitLabGroup() {
    return await this.get(StorageKeys.GITLAB_GROUP);
  },

  async setGitLabGroup(group) {
    await this.set(StorageKeys.GITLAB_GROUP, group);
  },

  async initialize() {
    const data = await chrome.storage.local.get(null);
    if (data[StorageKeys.QUICK_FILTERS] === undefined) {
      await this.setFilters(DEFAULT_FILTERS);
    }
    if (data[StorageKeys.PREFERENCES] === undefined) {
      await this.setPreferences(DEFAULT_PREFERENCES);
    }
    if (data[StorageKeys.REVIEWER_PRESETS] === undefined) {
      await this.setReviewerPresets([]);
    }
  }
};

// ============ Crypto ============
const Crypto = {
  async generateKey() {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  },

  async exportKey(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  },

  async importKey(keyData) {
    const rawKey = this.base64ToArrayBuffer(keyData);
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  },

  async encrypt(plaintext, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return {
      iv: this.arrayBufferToBase64(iv),
      ciphertext: this.arrayBufferToBase64(encrypted)
    };
  },

  async decrypt(encryptedData, key) {
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  },

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
};

// ============ GitLab API ============
class GitLabAPI {
  constructor(token) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${GITLAB_API_BASE}${endpoint}`;
    const headers = {
      'PRIVATE-TOKEN': this.token,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = new Error(`GitLab API error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async validateToken() {
    try {
      const user = await this.getCurrentUser();
      return { valid: true, user };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async getCurrentUser() {
    return await this.request('/user');
  }

  async searchUsers(query) {
    const params = new URLSearchParams({
      search: query,
      per_page: '10',
      active: 'true'
    });
    return await this.request(`/users?${params}`);
  }

  async searchGroupMembers(groupId, query) {
    const params = new URLSearchParams({
      query: query,
      per_page: '10'
    });
    return await this.request(`/groups/${encodeURIComponent(groupId)}/members/all?${params}`);
  }

  async searchProjectMembers(projectId, query) {
    const params = new URLSearchParams({
      query: query,
      per_page: '10'
    });
    return await this.request(`/projects/${encodeURIComponent(projectId)}/members/all?${params}`);
  }

  async getUserGroups() {
    const params = new URLSearchParams({
      per_page: '100',
      order_by: 'name',
      sort: 'asc'
    });
    return await this.request(`/groups?${params}`);
  }

  async updateMergeRequestReviewers(projectPath, mrIid, reviewerIds) {
    // First get current reviewers to merge with new ones
    const mr = await this.request(`/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`);
    const currentReviewerIds = (mr.reviewers || []).map(r => r.id);

    // Merge current and new reviewer IDs (avoid duplicates)
    const allReviewerIds = [...new Set([...currentReviewerIds, ...reviewerIds])];

    return await this.request(
      `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`,
      {
        method: 'PUT',
        body: JSON.stringify({ reviewer_ids: allReviewerIds })
      }
    );
  }

  async approveMergeRequest(projectPath, mrIid) {
    return await this.request(
      `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/approve`,
      { method: 'POST' }
    );
  }

  async unapproveMergeRequest(projectPath, mrIid) {
    return await this.request(
      `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/unapprove`,
      { method: 'POST' }
    );
  }

  async getMRApprovalStatus(projectPath, mrIid) {
    return await this.request(
      `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/approvals`
    );
  }
}

// ============ Token Management ============
async function getOrCreateEncryptionKey() {
  let keyData = await Storage.getSession('encryption_key');

  if (!keyData) {
    const key = await Crypto.generateKey();
    keyData = await Crypto.exportKey(key);
    await Storage.setSession('encryption_key', keyData);
    return key;
  }

  return await Crypto.importKey(keyData);
}

async function getToken() {
  const encryptedData = await Storage.getEncryptedToken();
  if (!encryptedData) {
    return null;
  }

  try {
    const key = await getOrCreateEncryptionKey();
    return await Crypto.decrypt(encryptedData, key);
  } catch (error) {
    console.error('Failed to decrypt token:', error);
    return null;
  }
}

async function saveToken(token) {
  const key = await getOrCreateEncryptionKey();
  const encryptedData = await Crypto.encrypt(token, key);
  await Storage.setEncryptedToken(encryptedData);
}

async function clearToken() {
  await Storage.clearToken();
  await Storage.clearCachedUser();
}

async function validateToken(token) {
  const api = new GitLabAPI(token);
  const result = await api.validateToken();

  if (result.valid) {
    await Storage.setCachedUser(result.user);
  }

  return result;
}

async function getCurrentUser() {
  const cached = await Storage.getCachedUser();
  const prefs = await Storage.getPreferences();
  const cacheMaxAge = prefs.cache_duration_hours * 60 * 60 * 1000;

  if (cached && (Date.now() - cached.fetched_at) < cacheMaxAge) {
    return cached;
  }

  const token = await getToken();
  if (!token) {
    return null;
  }

  const api = new GitLabAPI(token);
  try {
    const user = await api.getCurrentUser();
    await Storage.setCachedUser(user);
    return user;
  } catch (error) {
    console.error('Failed to fetch current user:', error);
    return cached || null;
  }
}

async function searchUsers(query) {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  const groupId = await Storage.getGitLabGroup();

  // If a group is configured, search within that group
  if (groupId) {
    try {
      return await api.searchGroupMembers(groupId, query);
    } catch (error) {
      console.error('Failed to search group members, falling back to global search:', error);
      return await api.searchUsers(query);
    }
  }

  return await api.searchUsers(query);
}

async function getUserGroups() {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  return await api.getUserGroups();
}

async function addReviewersToMR(projectPath, mrIid, reviewerIds) {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  return await api.updateMergeRequestReviewers(projectPath, mrIid, reviewerIds);
}

async function approveMR(projectPath, mrIid) {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  return await api.approveMergeRequest(projectPath, mrIid);
}

async function unapproveMR(projectPath, mrIid) {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  return await api.unapproveMergeRequest(projectPath, mrIid);
}

async function getMRApprovalStatus(projectPath, mrIid) {
  const token = await getToken();
  if (!token) {
    throw new Error('No token configured');
  }

  const api = new GitLabAPI(token);
  const approvals = await api.getMRApprovalStatus(projectPath, mrIid);
  const currentUser = await getCurrentUser();

  // Check if current user has approved
  const userApproved = approvals.approved_by?.some(
    approval => approval.user?.id === currentUser?.id
  ) || false;

  return {
    approved: approvals.approved,
    userApproved,
    approvedBy: approvals.approved_by || []
  };
}

// ============ Message Handler ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case MessageTypes.GET_TOKEN:
      return await getToken();

    case MessageTypes.SAVE_TOKEN:
      await saveToken(payload.token);
      return { saved: true };

    case MessageTypes.CLEAR_TOKEN:
      await clearToken();
      return { cleared: true };

    case MessageTypes.VALIDATE_TOKEN:
      return await validateToken(payload.token);

    case MessageTypes.GET_CURRENT_USER:
      return await getCurrentUser();

    case MessageTypes.SEARCH_USERS:
      return await searchUsers(payload.query);

    case MessageTypes.GET_FILTERS:
      return await Storage.getFilters();

    case MessageTypes.SAVE_FILTERS:
      await Storage.setFilters(payload.filters);
      return { saved: true };

    case MessageTypes.GET_REVIEWER_PRESETS:
      return await Storage.getReviewerPresets();

    case MessageTypes.SAVE_REVIEWER_PRESETS:
      await Storage.setReviewerPresets(payload.presets);
      return { saved: true };

    case MessageTypes.GET_PREFERENCES:
      return await Storage.getPreferences();

    case MessageTypes.SAVE_PREFERENCES:
      await Storage.setPreferences(payload.preferences);
      return { saved: true };

    case MessageTypes.GET_GITLAB_GROUP:
      return await Storage.getGitLabGroup();

    case MessageTypes.SAVE_GITLAB_GROUP:
      await Storage.setGitLabGroup(payload.groupId);
      return { saved: true };

    case MessageTypes.GET_USER_GROUPS:
      return await getUserGroups();

    case MessageTypes.OPEN_OPTIONS:
      chrome.runtime.openOptionsPage();
      return { opened: true };

    case MessageTypes.ADD_REVIEWERS_TO_MR:
      return await addReviewersToMR(payload.projectPath, payload.mrIid, payload.reviewerIds);

    case MessageTypes.APPROVE_MR:
      return await approveMR(payload.projectPath, payload.mrIid);

    case MessageTypes.UNAPPROVE_MR:
      return await unapproveMR(payload.projectPath, payload.mrIid);

    case MessageTypes.GET_MR_APPROVAL_STATUS:
      return await getMRApprovalStatus(payload.projectPath, payload.mrIid);

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

// ============ Initialization ============
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await Storage.initialize();
    console.log('GitLab Plus extension installed');
  } else if (details.reason === 'update') {
    console.log('GitLab Plus extension updated');
  }
});

console.log('GitLab Plus service worker started');
