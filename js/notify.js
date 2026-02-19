// ===== NOTIFICATION & SOUND SYSTEM =====
// All client-side. Works while the tab is open.

// ── Deduplication (localStorage-backed) ──────────────────────────────────────

const NOTIFIED_KEY = 'flint_notified_stages';
const WARNED_KEY = 'flint_warned_stages';

function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
}
function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch { }
}

const _notified = loadSet(NOTIFIED_KEY);
const _warned = loadSet(WARNED_KEY);

export function hasBeenNotified(mixId, stageIndex) { return _notified.has(`${mixId}:${stageIndex}`); }
export function markNotified(mixId, stageIndex) { _notified.add(`${mixId}:${stageIndex}`); saveSet(NOTIFIED_KEY, _notified); }
export function hasBeenWarned(mixId, stageIndex) { return _warned.has(`${mixId}:${stageIndex}`); }
export function markWarned(mixId, stageIndex) { _warned.add(`${mixId}:${stageIndex}`); saveSet(WARNED_KEY, _warned); }


// ── WebAudio ─────────────────────────────────────────────────────────────────

let _audioCtx = null;
let _soundUnlocked = false;

function unlockAudio() {
    _soundUnlocked = true;
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

function beep(freq, vol, duration, delay = 0) {
    if (!_soundUnlocked || !_audioCtx) return;
    try {
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, _audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(vol, _audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + delay + duration);
        osc.start(_audioCtx.currentTime + delay);
        osc.stop(_audioCtx.currentTime + delay + duration);
    } catch (e) { console.warn('Beep error:', e); }
}

export function playCompletionBeep() {
    beep(880, 0.4, 1.2); // A5 — loud, single
}

export function playWarningBeep() {
    beep(660, 0.2, 0.4, 0.0); // E5 double-beep — soft
    beep(660, 0.2, 0.4, 0.45);
}


// ── Browser Notifications ────────────────────────────────────────────────────

export function notifyStageComplete(mixName, stageName) {
    playCompletionBeep();
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⏱ Stage complete: ${mixName}`, {
            body: `"${stageName}" has finished!`,
            silent: true
        });
    }
}

export function notifyWarning(mixName, stageName, remainingMs) {
    playWarningBeep();
    const mins = Math.ceil(remainingMs / 60000);
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⚠️ ${mins} min left: ${mixName}`, {
            body: `Stage "${stageName}" is almost done!`,
            silent: true
        });
    }
}


// ── Favicon Badge (Feature 4) ────────────────────────────────────────────────

let _faviconLink = null;
let _originalFaviconHref = null;
let _faviconIsOverdue = false;

function getFaviconLink() {
    if (!_faviconLink) {
        _faviconLink = document.querySelector("link[rel*='icon']");
        if (!_faviconLink) {
            _faviconLink = document.createElement('link');
            _faviconLink.rel = 'icon';
            document.head.appendChild(_faviconLink);
        }
        _originalFaviconHref = _faviconLink.href;
    }
    return _faviconLink;
}

function makeFaviconDataUrl(bg, label) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, 2 * Math.PI);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 16, 17);
    return c.toDataURL();
}

export function setFaviconOverdue(hasOverdue) {
    const link = getFaviconLink();
    if (hasOverdue && !_faviconIsOverdue) {
        link.href = makeFaviconDataUrl('#d73a49', '!');
        _faviconIsOverdue = true;
    } else if (!hasOverdue && _faviconIsOverdue) {
        link.href = _originalFaviconHref || '';
        _faviconIsOverdue = false;
    }
}


// ── Card Flash CSS (Feature 3) ───────────────────────────────────────────────

(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
    @keyframes overdueFlash {
      0%,100% { box-shadow: 0 0 0px rgba(215,58,73,0); border-color: #d73a49; }
      50%     { box-shadow: 0 0 14px rgba(215,58,73,0.7); border-color: #ff4455; }
    }
    [data-mix-card].mix-overdue {
      animation: overdueFlash 1.5s ease-in-out infinite !important;
      border: 2px solid #d73a49 !important;
    }
  `;
    document.head.appendChild(s);
})();

export function markCardOverdue(timerEl) {
    const card = timerEl.closest('[data-mix-card]');
    if (card && !card.classList.contains('mix-overdue')) {
        card.classList.add('mix-overdue');
    }
}


// ── Permission Banner ────────────────────────────────────────────────────────

export function initNotifyUI() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const banner = document.createElement('div');
    banner.id = 'notify-banner';
    banner.style.cssText = [
        'position:fixed;bottom:16px;right:16px;z-index:9000',
        'background:#1c2333;border:1px solid #2f81f7;border-radius:10px',
        'padding:12px 16px;display:flex;align-items:center;gap:12px',
        'font-size:13px;color:#e6edf3;box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'animation:slideUp 0.3s ease'
    ].join(';');

    banner.innerHTML = `
    <style>
      @keyframes slideUp {
        from { transform:translateY(20px); opacity:0; }
        to   { transform:translateY(0);    opacity:1; }
      }
    </style>
    <span>🔔 Enable alerts for stage timers?</span>
    <button id="notify-allow-btn" style="background:#2f81f7;border:none;border-radius:6px;
      color:white;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:700;">Enable</button>
    <button id="notify-dismiss-btn" style="background:none;border:none;color:#9aa4b2;
      cursor:pointer;font-size:20px;line-height:1;padding:0 4px;" title="Dismiss">&times;</button>
  `;

    document.body.appendChild(banner);

    document.getElementById('notify-allow-btn').addEventListener('click', async () => {
        unlockAudio();
        const result = await Notification.requestPermission();
        banner.remove();
        if (result === 'granted') {
            new Notification('Notifications enabled ✓', {
                body: 'You will hear a beep and see an alert when a stage finishes.'
            });
        }
    });

    document.getElementById('notify-dismiss-btn').addEventListener('click', () => banner.remove());
}
