const formEls = {
  enabled: document.getElementById('enabled'),
  useApi: document.getElementById('useApi'),
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  sourceLang: document.getElementById('sourceLang'),
  targetLang: document.getElementById('targetLang'),
  requestChunkSize: document.getElementById('requestChunkSize')
};

const saveButton = document.getElementById('save');
const clearCacheButton = document.getElementById('clearCache');
const statusEl = document.getElementById('status');

function setStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = '';
    }
  }, 2000);
}

async function getSettings() {
  return chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
}

async function updateSettings(payload) {
  return chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload });
}

function fillForm(settings) {
  formEls.enabled.checked = Boolean(settings.enabled);
  formEls.useApi.checked = Boolean(settings.useApi);
  formEls.apiUrl.value = settings.apiUrl || '';
  formEls.apiKey.value = settings.apiKey || '';
  formEls.sourceLang.value = settings.sourceLang || 'zh';
  formEls.targetLang.value = settings.targetLang || 'ko';
  formEls.requestChunkSize.value = String(settings.requestChunkSize || 20);
}

function collectFormValues() {
  return {
    enabled: formEls.enabled.checked,
    useApi: formEls.useApi.checked,
    apiUrl: formEls.apiUrl.value.trim(),
    apiKey: formEls.apiKey.value.trim(),
    sourceLang: formEls.sourceLang.value.trim() || 'zh',
    targetLang: formEls.targetLang.value.trim() || 'ko',
    requestChunkSize: Number(formEls.requestChunkSize.value) || 20
  };
}

async function init() {
  const response = await getSettings();
  fillForm(response.settings);

  saveButton.addEventListener('click', async () => {
    const payload = collectFormValues();
    await updateSettings(payload);
    setStatus('저장되었습니다.');
  });

  clearCacheButton.addEventListener('click', async () => {
    await updateSettings({ clearCache: true });
    setStatus('캐시를 삭제했습니다.');
  });
}

init();
