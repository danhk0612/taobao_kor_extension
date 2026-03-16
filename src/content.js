const TEXT_NODE_MIN_LENGTH = 2;
const TRANSLATE_DEBOUNCE_MS = 300;

let enabled = true;
let translateTimer = null;

const pendingTextNodes = new Set();
const originalToNodes = new Map();
const lastAttemptedSourceText = new WeakMap();
const originalTextByNode = new WeakMap();

function hasChineseCharacters(text) {
  return /[\u4E00-\u9FFF]/.test(text);
}

function splitWhitespace(rawText) {
  const leading = rawText.match(/^\s*/)?.[0] || '';
  const trailing = rawText.match(/\s*$/)?.[0] || '';
  const core = rawText.trim();
  return { leading, core, trailing };
}

function shouldSkipTag(tagName) {
  return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE'].includes(tagName);
}

function isTextNodeTranslatable(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    return false;
  }

  const parent = node.parentElement;
  if (!parent || shouldSkipTag(parent.tagName)) {
    return false;
  }

  const rawText = node.textContent || '';
  const { core } = splitWhitespace(rawText);
  if (!core || core.length < TEXT_NODE_MIN_LENGTH || !hasChineseCharacters(core)) {
    return false;
  }

  return lastAttemptedSourceText.get(node) !== core;
}

function collectTextNodes(root = document.body) {
  if (!root) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (isTextNodeTranslatable(currentNode)) {
      pendingTextNodes.add(currentNode);
    }
    currentNode = walker.nextNode();
  }
}

function scheduleTranslation() {
  if (!enabled) {
    return;
  }

  if (translateTimer) {
    clearTimeout(translateTimer);
  }

  translateTimer = setTimeout(runTranslation, TRANSLATE_DEBOUNCE_MS);
}

async function runTranslation() {
  if (!enabled || pendingTextNodes.size === 0) {
    return;
  }

  originalToNodes.clear();

  for (const node of pendingTextNodes) {
    const rawText = node.textContent || '';
    const { core, leading, trailing } = splitWhitespace(rawText);

    if (!core) {
      continue;
    }

    if (!originalToNodes.has(core)) {
      originalToNodes.set(core, []);
    }

    originalToNodes.get(core).push({ node, leading, trailing, rawText });
  }

  pendingTextNodes.clear();

  const originals = [...originalToNodes.keys()];
  if (originals.length === 0) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_TEXTS',
      payload: { texts: originals }
    });

    if (!response?.ok || !Array.isArray(response.translatedTexts)) {
      return;
    }

    originals.forEach((original, idx) => {
      const translated = response.translatedTexts[idx] ?? original;
      const nodeEntries = originalToNodes.get(original) || [];

      nodeEntries.forEach(({ node, leading, trailing, rawText }) => {
        if (!node?.parentElement) {
          return;
        }

        if (!originalTextByNode.has(node)) {
          originalTextByNode.set(node, rawText);
        }

        node.textContent = `${leading}${translated}${trailing}`;

        if (translated !== original) {
          lastAttemptedSourceText.set(node, original);
        }
      });
    });
  } catch (error) {
    console.error('[Taobao KO Translator] Failed to translate nodes:', error);
  }
}

function restoreOriginalText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const originalText = originalTextByNode.get(currentNode);
    if (typeof originalText === 'string') {
      currentNode.textContent = originalText;
    }
    currentNode = walker.nextNode();
  }
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    enabled = Boolean(response?.settings?.enabled);
  } catch (error) {
    console.error('[Taobao KO Translator] Failed to load settings:', error);
    enabled = true;
  }
}

function observeDomChanges() {
  const observer = new MutationObserver((mutations) => {
    if (!enabled) {
      return;
    }

    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && isTextNodeTranslatable(node)) {
          pendingTextNodes.add(node);
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          collectTextNodes(node);
        }
      });

      if (mutation.type === 'characterData' && isTextNodeTranslatable(mutation.target)) {
        pendingTextNodes.add(mutation.target);
      }
    }

    scheduleTranslation();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function resetTranslatedState() {
  pendingTextNodes.clear();
  originalToNodes.clear();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SET_ENABLED') {
    enabled = Boolean(message.payload.enabled);

    if (enabled) {
      collectTextNodes(document.body);
      scheduleTranslation();
    } else {
      resetTranslatedState();
      restoreOriginalText();
    }

    sendResponse({ ok: true });
  }
});

(async function init() {
  await loadSettings();

  observeDomChanges();

  if (enabled) {
    collectTextNodes(document.body);
    scheduleTranslation();
  }
})();
