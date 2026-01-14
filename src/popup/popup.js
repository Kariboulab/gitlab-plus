// GitLab Plus Popup Script

const MessageTypes = {
  GET_CURRENT_USER: 'GET_CURRENT_USER',
  GET_PREFERENCES: 'GET_PREFERENCES',
  SAVE_PREFERENCES: 'SAVE_PREFERENCES'
};

// Send message to background script
async function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error || 'Unknown error'));
      }
    });
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  await loadPreferences();
  setupEventListeners();
});

async function loadStatus() {
  const loading = document.getElementById('status-loading');
  const connected = document.getElementById('status-connected');
  const disconnected = document.getElementById('status-disconnected');

  try {
    const user = await sendMessage(MessageTypes.GET_CURRENT_USER);

    loading.style.display = 'none';

    if (user) {
      document.getElementById('user-avatar').src = user.avatar_url;
      document.getElementById('user-name').textContent = user.name;
      document.getElementById('user-username').textContent = `@${user.username}`;
      connected.style.display = 'block';
    } else {
      disconnected.style.display = 'block';
    }
  } catch (error) {
    console.error('Failed to load status:', error);
    loading.style.display = 'none';
    disconnected.style.display = 'block';
  }
}

async function loadPreferences() {
  try {
    const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
    document.querySelector('#toggle-filters input').checked = prefs.enable_mr_filters;
    document.querySelector('#toggle-presets input').checked = prefs.enable_reviewer_presets;
    document.querySelector('#toggle-draft-dimming input').checked = prefs.enable_draft_dimming;
    document.querySelector('#toggle-age-indicator input').checked = prefs.enable_age_indicator;
    document.querySelector('#toggle-quick-approve input').checked = prefs.enable_quick_approve;
    document.querySelector('#toggle-copy-mr-link input').checked = prefs.enable_copy_mr_link;
    document.getElementById('copy-link-format').value = prefs.copy_link_format || 'markdown';
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

function setupEventListeners() {
  // Open options - directly use Chrome API
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close(); // Close popup after opening options
  });

  // Toggle filters
  document.querySelector('#toggle-filters input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_mr_filters = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Toggle presets
  document.querySelector('#toggle-presets input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_reviewer_presets = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Toggle draft dimming
  document.querySelector('#toggle-draft-dimming input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_draft_dimming = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Toggle age indicator
  document.querySelector('#toggle-age-indicator input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_age_indicator = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Toggle quick approve
  document.querySelector('#toggle-quick-approve input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_quick_approve = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Toggle copy MR link
  document.querySelector('#toggle-copy-mr-link input').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.enable_copy_mr_link = e.target.checked;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });

  // Copy link format selector
  document.getElementById('copy-link-format').addEventListener('change', async (e) => {
    try {
      const prefs = await sendMessage(MessageTypes.GET_PREFERENCES);
      prefs.copy_link_format = e.target.value;
      await sendMessage(MessageTypes.SAVE_PREFERENCES, { preferences: prefs });
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  });
}
