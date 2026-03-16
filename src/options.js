const API_PROVIDER_PRESETS = {
  libretranslate: 'https://libretranslate.de/translate',
  deepl: 'https://api-free.deepl.com/v2/translate',
  custom: ''
};

const formEls = {
  enabled: document.getElementById('enabled'),
  useApi: document.getElementById('useApi'),
  apiProvider: document.getElementById('apiProvider'),
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  sourceLang: document.getElementById('sourceLang'),
  targetLang: document.getElementById('targetLang'),
  requestChunkSize: document.getElementById('requestChunkSize'),
  userDictionary: document.getElementById('userDictionary')
};

const saveButton = document.getElementById('save');
const clearCacheButton = document.getElementById('clearCache');
const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '';
  setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = '';
      statusEl.style.color = '';
    }
  }, 3000);
}

function applyProviderPreset(provider) {
  const preset = API_PROVIDER_PRESETS[provider] ?? '';
  if (provider !== 'custom') {
    formEls.apiUrl.value = preset;
    formEls.apiUrl.readOnly = true;
  } else {
    formEls.apiUrl.readOnly = false;
    if (!formEls.apiUrl.value.trim()) {
      formEls.apiUrl.value = '';
    }
  }
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
  formEls.apiProvider.value = settings.apiProvider || 'libretranslate';
  formEls.apiUrl.value = settings.apiUrl || API_PROVIDER_PRESETS[formEls.apiProvider.value] || '';
  formEls.apiKey.value = settings.apiKey || '';
  formEls.sourceLang.value = settings.sourceLang || 'zh';
  formEls.targetLang.value = settings.targetLang || 'ko';
  formEls.requestChunkSize.value = String(settings.requestChunkSize || 20);
  formEls.userDictionary.value = JSON.stringify(settings.userDictionary || {}, null, 2);
  applyProviderPreset(formEls.apiProvider.value);
}

function parseDictionaryInput() {
  const raw = formEls.userDictionary.value.trim();
  if (!raw) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error('사용자 번역 사전은 올바른 JSON 형식이어야 합니다.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('사용자 번역 사전은 JSON 객체여야 합니다.');
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('사용자 번역 사전의 key/value는 모두 문자열이어야 합니다.');
    }

    const source = key.trim();
    const target = value.trim();
    if (!source || !target) {
      throw new Error('사용자 번역 사전의 key/value는 빈 값일 수 없습니다.');
    }

    sanitized[source] = target;
  }

  return sanitized;
}

function collectFormValues() {
  const provider = formEls.apiProvider.value;
  const apiUrl = provider === 'custom' ? formEls.apiUrl.value.trim() : API_PROVIDER_PRESETS[provider];

  return {
    enabled: formEls.enabled.checked,
    useApi: formEls.useApi.checked,
    apiProvider: provider,
    apiUrl,
    apiKey: formEls.apiKey.value.trim(),
    sourceLang: formEls.sourceLang.value.trim() || 'zh',
    targetLang: formEls.targetLang.value.trim() || 'ko',
    requestChunkSize: Number(formEls.requestChunkSize.value) || 20,
    userDictionary: parseDictionaryInput()
  };
}

async function init() {
  const response = await getSettings();
  fillForm(response.settings);

  formEls.apiProvider.addEventListener('change', () => {
    applyProviderPreset(formEls.apiProvider.value);
  });

  saveButton.addEventListener('click', async () => {
    try {
      const payload = collectFormValues();
      if (payload.apiProvider === 'custom' && !payload.apiUrl) {
        throw new Error('Custom API 사용 시 API URL을 입력하세요.');
      }

      await updateSettings(payload);
      setStatus('저장되었습니다.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  clearCacheButton.addEventListener('click', async () => {
    await updateSettings({ clearCache: true });
    setStatus('캐시를 삭제했습니다.');
  });
}

init();
