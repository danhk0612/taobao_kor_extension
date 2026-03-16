const enabledInput = document.getElementById('enabled');
const openOptionsButton = document.getElementById('openOptions');

async function getSettings() {
  return chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
}

async function updateSettings(payload) {
  return chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload });
}

async function notifyCurrentTab(enabled) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SET_ENABLED',
      payload: { enabled }
    });
  } catch (_error) {
    // Ignore if content script is not attached to this tab.
  }
}

async function init() {
  const response = await getSettings();
  enabledInput.checked = Boolean(response?.settings?.enabled);

  enabledInput.addEventListener('change', async () => {
    const enabled = enabledInput.checked;
    await updateSettings({ enabled });
    await notifyCurrentTab(enabled);
  });

  openOptionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

init();
