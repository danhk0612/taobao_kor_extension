const DEFAULT_SETTINGS = {
  enabled: true,
  useApi: false,
  apiUrl: 'https://libretranslate.de/translate',
  apiKey: '',
  sourceLang: 'zh',
  targetLang: 'ko',
  requestChunkSize: 20,
  cache: {}
};

const CACHE_MAX_ENTRIES = 3000;

const STATIC_DICTIONARY = {
  首页: '홈',
  我的淘宝: '내 타오바오',
  登录: '로그인',
  注册: '회원가입',
  购物车: '장바구니',
  收藏夹: '즐겨찾기',
  消息: '메시지',
  搜索: '검색',
  店铺: '상점',
  全部商品: '전체 상품',
  立即购买: '바로 구매',
  加入购物车: '장바구니 담기',
  客服: '고객센터',
  评价: '리뷰',
  销量: '판매량',
  价格: '가격',
  综合: '종합',
  新品: '신상품',
  更多: '더보기'
};

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    cache: {
      ...DEFAULT_SETTINGS.cache,
      ...(stored.cache || {})
    }
  };
}

async function setSettings(next) {
  await chrome.storage.local.set(next);
}

function sanitizeSettingsPatch(payload = {}) {
  const {
    enabled,
    useApi,
    apiUrl,
    apiKey,
    sourceLang,
    targetLang,
    requestChunkSize,
    clearCache
  } = payload;

  return {
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    useApi: typeof useApi === 'boolean' ? useApi : undefined,
    apiUrl: typeof apiUrl === 'string' ? apiUrl.trim() : undefined,
    apiKey: typeof apiKey === 'string' ? apiKey.trim() : undefined,
    sourceLang: typeof sourceLang === 'string' ? sourceLang.trim() || 'zh' : undefined,
    targetLang: typeof targetLang === 'string' ? targetLang.trim() || 'ko' : undefined,
    requestChunkSize:
      Number.isFinite(requestChunkSize) && requestChunkSize > 0
        ? Math.min(100, Math.floor(requestChunkSize))
        : undefined,
    clearCache: Boolean(clearCache)
  };
}

function sanitizeTranslatePayload(payload = {}) {
  if (!Array.isArray(payload.texts)) {
    return [];
  }

  return payload.texts.filter((text) => typeof text === 'string').slice(0, 500);
}

function normalizeText(text) {
  return text.trim();
}

function dictionaryTranslate(text) {
  return STATIC_DICTIONARY[text] || null;
}

function pruneCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length <= CACHE_MAX_ENTRIES) {
    return cache;
  }

  const dropCount = keys.length - CACHE_MAX_ENTRIES;
  for (let i = 0; i < dropCount; i += 1) {
    delete cache[keys[i]];
  }

  return cache;
}

async function translateBatchViaApi(texts, settings) {
  const body = {
    q: texts,
    source: settings.sourceLang,
    target: settings.targetLang,
    format: 'text'
  };

  if (settings.apiKey) {
    body.api_key = settings.apiKey;
  }

  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Translation API request failed with ${response.status}`);
  }

  const result = await response.json();
  if (Array.isArray(result.translatedText)) {
    return result.translatedText;
  }

  if (typeof result.translatedText === 'string') {
    return [result.translatedText];
  }

  throw new Error('Unexpected translation API response shape');
}

async function translateTexts(texts) {
  const settings = await getSettings();
  const cache = { ...settings.cache };
  const translated = new Array(texts.length);
  const unresolvedIndexes = [];

  texts.forEach((text, idx) => {
    const normalized = normalizeText(text);
    if (!normalized) {
      translated[idx] = text;
      return;
    }

    if (cache[normalized]) {
      translated[idx] = cache[normalized];
      return;
    }

    const staticMatch = dictionaryTranslate(normalized);
    if (staticMatch) {
      cache[normalized] = staticMatch;
      translated[idx] = staticMatch;
      return;
    }

    unresolvedIndexes.push(idx);
  });

  if (settings.useApi && unresolvedIndexes.length > 0) {
    const chunkSize = Math.max(1, settings.requestChunkSize || 20);
    for (let i = 0; i < unresolvedIndexes.length; i += chunkSize) {
      const chunkIndexes = unresolvedIndexes.slice(i, i + chunkSize);
      const chunkTexts = chunkIndexes.map((idx) => normalizeText(texts[idx]));

      try {
        const apiResult = await translateBatchViaApi(chunkTexts, settings);
        chunkIndexes.forEach((idx, localIdx) => {
          const original = normalizeText(texts[idx]);
          const value = apiResult[localIdx] || original;
          cache[original] = value;
          translated[idx] = value;
        });
      } catch (error) {
        console.error('[Taobao KO Translator] API translation failed:', error);
        chunkIndexes.forEach((idx) => {
          translated[idx] = normalizeText(texts[idx]);
        });
      }
    }
  }

  unresolvedIndexes.forEach((idx) => {
    if (!translated[idx]) {
      translated[idx] = normalizeText(texts[idx]);
    }
  });

  await setSettings({ cache: pruneCache(cache) });
  return translated;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setSettings(settings);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TRANSLATE_TEXTS') {
    const texts = sanitizeTranslatePayload(message.payload);

    translateTexts(texts)
      .then((translatedTexts) => sendResponse({ ok: true, translatedTexts }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === 'GET_SETTINGS') {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === 'UPDATE_SETTINGS') {
    getSettings()
      .then(async (settings) => {
        const patch = sanitizeSettingsPatch(message.payload);
        const nextSettings = {
          ...settings,
          ...Object.fromEntries(
            Object.entries(patch).filter(([key, value]) => key !== 'clearCache' && value !== undefined)
          )
        };

        if (patch.clearCache) {
          nextSettings.cache = {};
        }

        await setSettings(nextSettings);
        sendResponse({ ok: true, settings: nextSettings });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});
