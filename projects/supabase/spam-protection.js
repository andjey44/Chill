// Chill MVP anti-spam protection
// Client-side protection for accidental double clicks and simple bot-like spam.
// Important: this is MVP-level protection. Production anti-spam should also include backend / edge-function rate limits.

(function () {
  const LIMITS = {
    auth: {
      maxAttempts: 5,
      windowMs: 10 * 60 * 1000,
      cooldownMs: 30 * 1000
    },
    write: {
      maxAttempts: 12,
      windowMs: 60 * 1000,
      cooldownMs: 15 * 1000
    },
    destructive: {
      maxAttempts: 8,
      windowMs: 60 * 1000,
      cooldownMs: 20 * 1000
    }
  };

  const storeKey = 'chill_spam_protection_v1';
  const lastAction = new Map();

  function now() {
    return Date.now();
  }

  function readStore() {
    try {
      return JSON.parse(sessionStorage.getItem(storeKey)) || {};
    } catch {
      return {};
    }
  }

  function writeStore(data) {
    sessionStorage.setItem(storeKey, JSON.stringify(data));
  }

  function getBucket(key) {
    const data = readStore();
    return data[key] || {
      attempts: [],
      blockedUntil: 0
    };
  }

  function setBucket(key, bucket) {
    const data = readStore();
    data[key] = bucket;
    writeStore(data);
  }

  function formatSeconds(ms) {
    return Math.max(1, Math.ceil(ms / 1000));
  }

  function checkHoneypot() {
    const field = document.getElementById('auth-modal-website');
    return !field || !field.value.trim();
  }

  function checkAction(type, label) {
    const config = LIMITS[type] || LIMITS.write;
    const key = `rate:${type}`;
    const current = now();
    const bucket = getBucket(key);

    if (bucket.blockedUntil && bucket.blockedUntil > current) {
      const secondsLeft = formatSeconds(bucket.blockedUntil - current);
      showToast(`Слишком много действий. Подождите ${secondsLeft} сек.`);
      return false;
    }

    const attempts = (bucket.attempts || []).filter(time => current - time < config.windowMs);

    if (attempts.length >= config.maxAttempts) {
      bucket.attempts = attempts;
      bucket.blockedUntil = current + config.cooldownMs;
      setBucket(key, bucket);
      showToast(`Защита от спама: ${label}. Попробуйте позже.`);
      return false;
    }

    attempts.push(current);
    bucket.attempts = attempts;
    bucket.blockedUntil = 0;
    setBucket(key, bucket);
    return true;
  }

  function preventDoubleClick(actionName, delayMs = 900) {
    const current = now();
    const previous = lastAction.get(actionName) || 0;

    if (current - previous < delayMs) {
      showToast('Не так быстро 🙂');
      return false;
    }

    lastAction.set(actionName, current);
    return true;
  }

  function protectButton(button, lockedText = 'Подождите...') {
    if (!button) return () => {};

    const oldText = button.textContent;
    button.disabled = true;
    button.dataset.oldText = oldText;
    button.textContent = lockedText;

    return function unlock() {
      button.disabled = false;
      button.textContent = button.dataset.oldText || oldText;
    };
  }

  function addHoneypotToAuthModal() {
    const form = document.getElementById('auth-modal-form');

    if (!form || document.getElementById('auth-modal-website')) return;

    const honeypot = document.createElement('div');
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.position = 'absolute';
    honeypot.style.left = '-9999px';
    honeypot.style.opacity = '0';
    honeypot.style.pointerEvents = 'none';
    honeypot.innerHTML = `
      <label for="auth-modal-website">Website</label>
      <input id="auth-modal-website" type="text" tabindex="-1" autocomplete="off" />
    `;

    form.appendChild(honeypot);
  }

  function observeAuthModal() {
    addHoneypotToAuthModal();

    const observer = new MutationObserver(addHoneypotToAuthModal);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.chillSpamProtection = {
    allowAuth(label = 'авторизация') {
      if (!checkHoneypot()) {
        showToast('Защита от спама сработала');
        return false;
      }

      return preventDoubleClick('auth', 1200) && checkAction('auth', label);
    },

    allowWrite(label = 'запись данных') {
      return preventDoubleClick(label, 700) && checkAction('write', label);
    },

    allowDestructive(label = 'удаление данных') {
      return preventDoubleClick(label, 900) && checkAction('destructive', label);
    },

    protectButton
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAuthModal);
  } else {
    observeAuthModal();
  }
})();
