// ===== NOTIFICATION & SOUND SYSTEM =====
// Client-side only. Works while the tab is open.

const STORAGE_KEY = 'flint_notified_stages';

// --- Persist notified stages in localStorage so refresh doesn't re-fire ---
function loadNotified() {
    try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function saveNotified(set) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch { }
}

const _notified = loadNotified();

export function hasBeenNotified(mixId, stageIndex) {
    return _notified.has(`${mixId}:${stageIndex}`);
}

export function markNotified(mixId, stageIndex) {
    _notified.add(`${mixId}:${stageIndex}`);
    saveNotified(_notified);
}


// --- WebAudio beep — no extra files needed ---
// Sound only plays after a user gesture (browser autoplay rules).
let _audioCtx = null;
let _soundUnlocked = false;

function unlockAudio() {
    _soundUnlocked = true;
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
}

// Unlock on any user interaction
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

export function playBeep() {
    if (!_soundUnlocked || !_audioCtx) return;
    try {
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);      // A5
        gain.gain.setValueAtTime(0.4, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 1.2);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 1.2);
    } catch (e) {
        console.warn('Beep failed:', e);
    }
}


// --- Main notify function ---
export function notifyStageComplete(mixName, stageName) {
    playBeep();

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⏱ Stage complete: ${mixName}`, {
            body: `"${stageName}" has finished!`,
            silent: true // we handle sound ourselves
        });
    }
}


// --- Permission prompt UI ---
// Shows a small banner in the bottom-right corner if permission is "default".
// Call once from main.js on every page.
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
        from { transform: translateY(20px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
    </style>
    <span>🔔 Enable alerts for stage timers?</span>
    <button id="notify-allow-btn" style="
      background:#2f81f7;border:none;border-radius:6px;
      color:white;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:700;">
      Enable
    </button>
    <button id="notify-dismiss-btn" style="
      background:none;border:none;color:#9aa4b2;
      cursor:pointer;font-size:20px;line-height:1;padding:0 4px;" title="Dismiss">
      &times;
    </button>
  `;

    document.body.appendChild(banner);

    document.getElementById('notify-allow-btn').addEventListener('click', async () => {
        unlockAudio(); // treat button click as user gesture for sound
        const result = await Notification.requestPermission();
        banner.remove();
        if (result === 'granted') {
            new Notification('Notifications enabled ✓', {
                body: 'You will hear a beep and see an alert when a stage finishes.'
            });
        }
    });

    document.getElementById('notify-dismiss-btn').addEventListener('click', () => {
        banner.remove();
    });
}
