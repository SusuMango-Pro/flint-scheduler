// Flint Hydrogel Scheduler
// - 3 sequential steps (Powder 1 -> 2 -> 3)
// - stores start time + duration for each step
// - auto-updates elapsed/remaining every second
// - persists to localStorage

const STORAGE_KEY = "flint_scheduler_v1";

const powderSelect = document.getElementById("powderSelect");
const durationHours = document.getElementById("durationHours");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const demoBtn = document.getElementById("demoBtn");
const rowsEl = document.getElementById("rows");

// Data model
// steps = {
//   1: { startedAtMs: number, durationMs: number },
//   2: { startedAtMs: number, durationMs: number },
//   3: { startedAtMs: number, durationMs: number },
// }
let steps = loadSteps();

function saveSteps() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
}

function loadSteps() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function msToClock(ms) {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);

  const totalSeconds = Math.floor(abs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${sign}${hh}:${mm}:${ss}`;
}

function formatTime(msEpoch) {
  const d = new Date(msEpoch);
  return d.toLocaleString();
}

function getStatus(stepNum, nowMs) {
  const step = steps[stepNum];
  if (!step) return { text: "Waiting", cls: "waiting" };

  const endMs = step.startedAtMs + step.durationMs;
  if (nowMs >= endMs) return { text: "Done", cls: "done" };
  return { text: "Running", cls: "running" };
}

function canStartStep(stepNum) {
  // Step 1 can always start.
  if (stepNum === 1) return true;
  // Step 2 requires step 1 to exist.
  if (stepNum === 2) return !!steps[1];
  // Step 3 requires step 2 to exist.
  if (stepNum === 3) return !!steps[2];
  return false;
}

function render() {
  const nowMs = Date.now();
  rowsEl.innerHTML = "";

  for (let i = 1; i <= 3; i++) {
    const step = steps[i];
    const tr = document.createElement("tr");

    const status = getStatus(i, nowMs);

    const startedAtText = step ? formatTime(step.startedAtMs) : "—";
    const durationText = step ? `${(step.durationMs / 3600000).toFixed(2)} h` : "—";

    const elapsedMs = step ? (nowMs - step.startedAtMs) : 0;
    const remainingMs = step ? (step.startedAtMs + step.durationMs - nowMs) : 0;

    const elapsedText = step ? msToClock(elapsedMs) : "—";
    const remainingText = step ? msToClock(Math.max(0, remainingMs)) : "—";

    tr.innerHTML = `
      <td><strong>Powder ${i}</strong></td>
      <td>${startedAtText}</td>
      <td>${durationText}</td>
      <td>${elapsedText}</td>
      <td>${remainingText}</td>
      <td class="status ${status.cls}">${status.text}</td>
    `;

    rowsEl.appendChild(tr);
  }
}

startBtn.addEventListener("click", () => {
  const stepNum = Number(powderSelect.value);

  const hours = Number(durationHours.value);
  if (!Number.isFinite(hours) || hours <= 0) {
    alert("Please enter a valid duration in hours (e.g. 2 or 0.5).");
    return;
  }

  if (!canStartStep(stepNum)) {
    if (stepNum === 2) alert("You must start Powder 1 before Powder 2.");
    if (stepNum === 3) alert("You must start Powder 2 before Powder 3.");
    return;
  }

  // If they restart the same step, we overwrite it (simple + practical).
  steps[stepNum] = {
    startedAtMs: Date.now(),
    durationMs: Math.round(hours * 3600000),
  };

  saveSteps();
  render();
});

resetBtn.addEventListener("click", () => {
  const ok = confirm("Reset all steps? This clears the schedule.");
  if (!ok) return;

  steps = {};
  saveSteps();
  render();
});

demoBtn.addEventListener("click", () => {
  // Example: started recently, short durations so you can see it update quickly.
  const now = Date.now();
  steps = {
    1: { startedAtMs: now - 20 * 60 * 1000, durationMs: 60 * 60 * 1000 }, // started 20m ago, 1h total
    2: { startedAtMs: now - 5 * 60 * 1000, durationMs: 30 * 60 * 1000 },  // started 5m ago, 30m total
  };
  saveSteps();
  render();
});

// Initial render + live updates
render();
setInterval(render, 1000);

