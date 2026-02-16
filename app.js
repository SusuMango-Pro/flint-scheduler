// ====== Storage keys ======
const USERS_KEY = "mix_users_v1";
const SESSION_KEY = "mix_session_v1";
const MIXES_KEY = "mix_active_v1";

// ====== Helpers ======
function load(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function nowMs() { return Date.now(); }
function msToClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function fmtTime(msEpoch) {
  return new Date(msEpoch).toLocaleString();
}

// ====== Auth (prototype) ======
function getUsers() { return load(USERS_KEY, []); }
function setUsers(users) { save(USERS_KEY, users); }
function getSession() { return load(SESSION_KEY, null); }
function setSession(sess) { save(SESSION_KEY, sess); }
function logout() { localStorage.removeItem(SESSION_KEY); }

function signup({ username, email, password }) {
  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok:false, msg:"Username already exists." };
  }
  users.push({ username, email, password }); // NOTE: insecure prototype
  setUsers(users);
  setSession({ username, email });
  return { ok:true, msg:"Account created. You are logged in." };
}

function login({ username, password }) {
  const users = getUsers();
  const u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
  if (!u) return { ok:false, msg:"User not found." };
  if (u.password !== password) return { ok:false, msg:"Wrong password." };
  setSession({ username: u.username, email: u.email });
  return { ok:true, msg:"Logged in." };
}

// ====== Mixes ======
function getMixes() { return load(MIXES_KEY, []); }
function setMixes(mixes) { save(MIXES_KEY, mixes); }

function addMix({ createdBy, mixName, durationMin }) {
  const mixes = getMixes();
  mixes.push({
    id: crypto.randomUUID(),
    createdBy,
    mixName,
    startedAtMs: nowMs(),
    durationMs: Math.round(durationMin * 60 * 1000),
  });
  setMixes(mixes);
}

// ====== Pages ======
function initIndexPage() {
  const userBadge = document.getElementById("userBadge");
  const loginLink = document.getElementById("loginLink");
  const logoutBtn = document.getElementById("logoutBtn");
  const addMixBtn = document.getElementById("addMixBtn");
  const mixRows = document.getElementById("mixRows");
  const seedDemoBtn = document.getElementById("seedDemoBtn");

  function renderHeader() {
    const sess = getSession();
    if (sess) {
      userBadge.textContent = `Logged in as ${sess.username}`;
      userBadge.classList.remove("muted");
      loginLink.style.display = "none";
      logoutBtn.style.display = "inline-flex";
    } else {
      userBadge.textContent = "Not logged in";
      userBadge.classList.add("muted");
      loginLink.style.display = "inline-flex";
      logoutBtn.style.display = "none";
    }
  }

  function renderTable() {
    const mixes = getMixes();
    const t = nowMs();

    mixRows.innerHTML = "";
    if (mixes.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="color:#9aa4b2;">No active mixes yet.</td>`;
      mixRows.appendChild(tr);
      return;
    }

    for (const mix of mixes) {
      const end = mix.startedAtMs + mix.durationMs;
      const left = end - t;
      const status = left <= 0 ? { text:"Done", cls:"done" } : { text:"Running", cls:"running" };

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${mix.createdBy}</td>
        <td>${mix.mixName}</td>
        <td>${fmtTime(mix.startedAtMs)}</td>
        <td>${(mix.durationMs / 60000).toFixed(0)} min</td>
        <td>${msToClock(left)}</td>
        <td class="status ${status.cls}">${status.text}</td>
      `;
      mixRows.appendChild(tr);
    }
  }

  // Button behavior
  addMixBtn.addEventListener("click", (e) => {
    const sess = getSession();
    if (!sess) {
      e.preventDefault();
      window.location.href = "login.html";
    }
  });

  logoutBtn.addEventListener("click", () => {
    logout();
    renderHeader();
  });

  seedDemoBtn.addEventListener("click", () => {
    const sess = getSession() || { username: "demoUser" };
    const base = nowMs();
    setMixes([
      { id: crypto.randomUUID(), createdBy: sess.username, mixName: "Batch A", startedAtMs: base - 10*60*1000, durationMs: 60*60*1000 },
      { id: crypto.randomUUID(), createdBy: "sam", mixName: "Batch B", startedAtMs: base - 50*60*1000, durationMs: 55*60*1000 },
    ]);
    renderTable();
  });

  renderHeader();
  renderTable();
  setInterval(renderTable, 1000);
}

function initLoginPage() {
  const msg = document.getElementById("msg");

  document.getElementById("signupBtn").addEventListener("click", () => {
    const username = document.getElementById("su_username").value.trim();
    const email = document.getElementById("su_email").value.trim();
    const password = document.getElementById("su_password").value;

    if (!username || !email || !password) {
      msg.textContent = "Fill all signup fields.";
      return;
    }
    const res = signup({ username, email, password });
    msg.textContent = res.msg;
    if (res.ok) window.location.href = "index.html";
  });

  document.getElementById("loginBtn").addEventListener("click", () => {
    const username = document.getElementById("li_username").value.trim();
    const password = document.getElementById("li_password").value;

    if (!username || !password) {
      msg.textContent = "Fill username + password.";
      return;
    }
    const res = login({ username, password });
    msg.textContent = res.msg;
    if (res.ok) window.location.href = "index.html";
  });
}

function initAddMixPage() {
  const msg = document.getElementById("msg");
  const sess = getSession();
  if (!sess) {
    // Hard rule: must be logged in
    window.location.href = "login.html";
    return;
  }

  document.getElementById("createMixBtn").addEventListener("click", () => {
    const mixName = document.getElementById("mixName").value.trim();
    const minutes = Number(document.getElementById("mixMinutes").value);

    if (!mixName) {
      msg.textContent = "Please enter what you're mixing.";
      return;
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      msg.textContent = "Please enter a valid duration in minutes.";
      return;
    }

    addMix({ createdBy: sess.username, mixName, durationMin: minutes });
    window.location.href = "index.html";
  });
}
