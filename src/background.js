const DEFAULT_SETTINGS = {
  enabled: true,
  useApi: false,
  apiUrl: 'https://libretranslate.de/translate',
  apiKey: '',
  sourceLang: 'zh',
  targetLang: 'ko',
  requestChunkSize: 20,
  userDictionary: {},
  cache: {}
};

const CACHE_MAX_ENTRIES = 3000;
const STATIC_DICTIONARY_URL = chrome.runtime.getURL('src/static_dictionary.json');

let staticDictionaryCache = null;

const CN_NUMERAL_MAP = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
};

const PATTERN_TRANSLATIONS = [
  {
    regex: /^套餐([一二三四五六七八九十\d]+)$/,
    translate: ([raw]) => `세트${toKoreanNumberString(raw)}`
  },
  {
    regex: /^月销\s*(\d+)\+$/,
    translate: ([count]) => `월 판매 ${count}+`
  },
  {
    regex: /^月销\s*(\d+)$/,
    translate: ([count]) => `월 판매 ${count}`
  },
  {
    regex: /^已售\s*(\d+)\+$/,
    translate: ([count]) => `판매 ${count}+`
  },
  {
    regex: /^已售\s*(\d+)$/,
    translate: ([count]) => `판매 ${count}`
  },
  {
    regex: /^领券减\s*(\d+)$/,
    translate: ([amount]) => `쿠폰 할인 ${amount}`
  },
  {
    regex: /^下单立减\s*(\d+)$/,
    translate: ([amount]) => `주문 즉시 할인 ${amount}`
  },
  {
    regex: /^(\d+)件$/,
    translate: ([count]) => `${count}개`
  },
  {
    regex: /^(\d+)套$/,
    translate: ([count]) => `${count}세트`
  },
  {
    regex: /^满\s*(\d+)\s*减\s*(\d+)$/,
    translate: ([threshold, amount]) => `${threshold} 이상 구매 시 ${amount} 할인`
  },
  {
    regex: /^预计(\d+)小时内发货$/,
    translate: ([hours]) => `${hours}시간 내 발송 예정`
  },
  {
    regex: /^承诺(\d+)小时内发货$/,
    translate: ([hours]) => `${hours}시간 내 발송 보장`
  },
  {
    regex: /^近(\d+)个月好评率高达([\d.]+)%$/,
    translate: ([months, rate]) => `최근 ${months}개월 긍정 리뷰 비율 ${rate}%`
  },
  {
    regex: /^签到可得(\d+)淘金币$/,
    translate: ([coin]) => `출석 시 ${coin} 타오코인 지급`
  },
  {
    regex: /^超过千人加购$/,
    translate: () => '1천 명 이상 장바구니 추가'
  }
];

function toKoreanNumberString(raw) {
  if (/^\d+$/.test(raw)) {
    return raw;
  }

  return String(CN_NUMERAL_MAP[raw] ?? raw);
}

function translateByPattern(text) {
  for (const pattern of PATTERN_TRANSLATIONS) {
    const match = text.match(pattern.regex);
    if (!match) {
      continue;
    }

    return pattern.translate(match.slice(1));
  }

  return null;
}

async function loadStaticDictionary() {
  if (staticDictionaryCache) {
    return staticDictionaryCache;
  }

  try {
    const response = await fetch(STATIC_DICTIONARY_URL);
    if (!response.ok) {
      throw new Error(`Failed to load static dictionary: ${response.status}`);
    }

    const dictionary = await response.json();
    staticDictionaryCache = typeof dictionary === 'object' && dictionary ? dictionary : {};
  } catch (error) {
    console.error('[Taobao KO Translator] Static dictionary load failed:', error);
    staticDictionaryCache = {};
  }

  return staticDictionaryCache;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    userDictionary: {
      ...DEFAULT_SETTINGS.userDictionary,
      ...(stored.userDictionary || {})
    },
    cache: {
      ...DEFAULT_SETTINGS.cache,
      ...(stored.cache || {})
    }
  };
}

async function setSettings(next) {
  await chrome.storage.local.set(next);
}

function sanitizeDictionaryObject(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  const result = {};
  Object.entries(candidate).forEach(([key, value]) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return;
    }

    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      return;
    }

    result[normalizedKey] = normalizedValue;
  });

  return result;
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
    userDictionary,
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
    userDictionary: sanitizeDictionaryObject(userDictionary),
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

async function dictionaryTranslate(text, settings) {
  const staticDictionary = await loadStaticDictionary();
  const userDictionary = settings.userDictionary || {};

  return userDictionary[text] || staticDictionary[text] || translateByPattern(text) || null;
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

  for (let idx = 0; idx < texts.length; idx += 1) {
    const text = texts[idx];
    const normalized = normalizeText(text);
    if (!normalized) {
      translated[idx] = text;
      continue;
    }

    if (cache[normalized]) {
      translated[idx] = cache[normalized];
      continue;
    }

    const dictionaryMatch = await dictionaryTranslate(normalized, settings);
    if (dictionaryMatch) {
      cache[normalized] = dictionaryMatch;
      translated[idx] = dictionaryMatch;
      continue;
    }

    unresolvedIndexes.push(idx);
  }

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
  await loadStaticDictionary();
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
