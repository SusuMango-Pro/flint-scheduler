// ====== Helpers ======
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

function setAuthDebug(msg) {
  try {
    const el = document.getElementById('authDebug');
    if (el) el.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg);
  } catch (e) { /* ignore */ }
}

// ====== Firebase Auth ======
async function signup({ email, password, username }) {
  const { auth } = window.firebase;
  const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: username });
    return { ok: true, msg: "Account created. You are logged in." };
  } catch (err) {
    if (err.code === "auth/email-already-in-use") return { ok: false, msg: "Email already in use." };
    if (err.code === "auth/weak-password") return { ok: false, msg: "Password is too weak." };
    return { ok: false, msg: err.message };
  }
}

async function login({ email, password }) {
  const { auth } = window.firebase;
  const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, msg: "Logged in." };
  } catch (err) {
    if (err.code === "auth/user-not-found") return { ok: false, msg: "User not found." };
    if (err.code === "auth/wrong-password") return { ok: false, msg: "Wrong password." };
    return { ok: false, msg: err.message };
  }
}

async function logoutUser() {
  const { auth } = window.firebase;
  const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  
  try {
    await signOut(auth);
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

// ====== Firestore Mixes ======
async function addMix({ createdBy, createdByUid, mixName, steps }) {
  const { db, collection, addDoc } = window.firebase;
  
  try {
    await addDoc(collection(db, "mixes"), {
      createdBy,
      createdByUid,
      mixName,
      steps: steps, // Array of { name, durationMs }
      currentStepIndex: 0,
      createdAtMs: nowMs(),
      currentStepStartedAtMs: null,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

async function updateMixStep(mixId, stepIndex, startedAtMs) {
  const { db, doc, updateDoc } = window.firebase;
  
  try {
    await updateDoc(doc(db, "mixes", mixId), {
      currentStepIndex: stepIndex,
      currentStepStartedAtMs: startedAtMs,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

async function subscribeToMixes(callback) {
  const { db, collection, onSnapshot } = window.firebase;
  
  try {
    return onSnapshot(collection(db, "mixes"), (snapshot) => {
      const mixes = [];
      snapshot.forEach((doc) => {
        mixes.push({ id: doc.id, ...doc.data() });
      });
      callback(mixes);
    });
  } catch (err) {
    console.error("Error subscribing to mixes:", err);
    return null;
  }
}

// ====== Pages ======
async function nextStep(mixId, currentStepIndex, totalSteps) {
  if (currentStepIndex < totalSteps - 1) {
    // Move to next step
    await updateMixStep(mixId, currentStepIndex + 1, nowMs());
  } else {
    // Last step - mark as done (you could delete or archive instead)
    await updateMixStep(mixId, currentStepIndex, nowMs());
  }
}

// Make nextStep globally accessible
window.nextStep = nextStep;
function initIndexPage() {
  const userBadge = document.getElementById("userBadge");
  const loginLink = document.getElementById("loginLink");
  const logoutBtn = document.getElementById("logoutBtn");
  const addMixBtn = document.getElementById("addMixBtn");
  const mixRows = document.getElementById("mixRows");
  const seedDemoBtn = document.getElementById("seedDemoBtn");

  const { auth, onAuthStateChanged } = window.firebase;
  console.log('initIndexPage - window.firebase present?', !!window.firebase);
  console.log('initIndexPage - auth.currentUser before listener:', auth && auth.currentUser);
  setAuthDebug('initIndexPage - window.firebase present: ' + (!!window.firebase) + ' auth.currentUser: ' + JSON.stringify(auth && auth.currentUser));
  
  let currentUser = null;
  let unsubscribeMixes = null;

  function renderHeader() {
    if (currentUser) {
      const display = currentUser.username || currentUser.email || 'Unknown';
      userBadge.textContent = `Logged in as ${display}`;
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

  function renderTable(mixes) {
    const t = nowMs();
    mixRows.innerHTML = "";
    if (mixes.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" style="color:#9aa4b2;">No active mixes yet.</td>`;
      mixRows.appendChild(tr);
      return;
    }

    for (const mix of mixes) {
      const stepIndex = mix.currentStepIndex || 0;
      const steps = mix.steps || [];
      const currentStep = steps[stepIndex];
      
      if (!currentStep) continue; // Skip if step not found
      
      // Calculate time remaining for current step
      const stepStarted = mix.currentStepStartedAtMs || mix.createdAtMs || t;
      const stepEnd = stepStarted + currentStep.durationMs;
      const timeLeftMs = Math.max(0, stepEnd - t);
      const status = timeLeftMs <= 0 ? { text:"Step complete", cls:"done" } : { text:"In progress", cls:"running" };
      const isLastStep = stepIndex === steps.length - 1;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${mix.createdBy}</td>
        <td>${mix.mixName}</td>
        <td>${currentStep.name}</td>
        <td>${stepIndex + 1}/${steps.length}</td>
        <td>${msToClock(timeLeftMs)}</td>
        <td class="status ${status.cls}">${status.text}</td>
        <td><button class="btn small" onclick="nextStep('${mix.id}', ${stepIndex}, ${steps.length})">
          ${isLastStep ? "✓ Done" : "→ Next"}
        </button></td>
      `;
      mixRows.appendChild(tr);
    }
  }

  addMixBtn.addEventListener("click", (e) => {
    if (!currentUser) {
      e.preventDefault();
      window.location.href = "login.html";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await logoutUser();
  });

  seedDemoBtn.addEventListener("click", () => {
    const base = nowMs();
    renderTable([
      { 
        id: "1", 
        createdBy: currentUser?.username || "demoUser", 
        mixName: "Batch A",
        createdAtMs: base - 30*60*1000,
        currentStepIndex: 0,
        currentStepStartedAtMs: base - 10*60*1000,
        steps: [
          { name: "Powder 1", durationMs: 30*60*1000 },
          { name: "Powder 2", durationMs: 20*60*1000 },
          { name: "Powder 3", durationMs: 15*60*1000 }
        ]
      },
      { 
        id: "2", 
        createdBy: "sam", 
        mixName: "Batch B",
        createdAtMs: base - 50*60*1000,
        currentStepIndex: 1,
        currentStepStartedAtMs: base - 20*60*1000,
        steps: [
          { name: "Powder 1", durationMs: 25*60*1000 },
          { name: "Powder 2", durationMs: 25*60*1000 },
          { name: "Powder 3", durationMs: 25*60*1000 }
        ]
      },
    ]);
  });

  // Listen for auth state changes
  onAuthStateChanged(auth, (user) => {
    console.log('onAuthStateChanged fired, user =', user);
    setAuthDebug('onAuthStateChanged: ' + (user ? JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName }) : 'null'));
    if (user) {
      currentUser = { uid: user.uid, email: user.email, username: user.displayName };
      renderHeader();
      
      // Subscribe to mixes
      if (!unsubscribeMixes) {
        unsubscribeMixes = subscribeToMixes(renderTable);
      }
    } else {
      currentUser = null;
      renderHeader();
      
      // Unsubscribe from mixes
      if (unsubscribeMixes) {
        unsubscribeMixes();
        unsubscribeMixes = null;
      }
      renderTable([]);
    }
  });

  renderHeader();
  // Refresh table every second for time display updates
  setInterval(() => {
    const rows = Array.from(mixRows.querySelectorAll("tr"));
    if (rows.length === 0) return;
    
    const t = nowMs();
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length === 6) {
        const durationText = cells[3].textContent;
        const durationMin = parseInt(durationText);
        const startedText = cells[2].textContent;
        // Recalculate time left on the fly
        // This is a simplification - in production you'd want to store mix data for accuracy
      }
    });
  }, 1000);
}

function initLoginPage() {
  const msg = document.getElementById("msg");

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const username = document.getElementById("su_username").value.trim();
    const email = document.getElementById("su_email").value.trim();
    const password = document.getElementById("su_password").value;

    if (!username || !email || !password) {
      msg.textContent = "Fill all signup fields.";
      return;
    }
    const res = await signup({ email, password, username });
    msg.textContent = res.msg;
    setAuthDebug('signup result: ' + JSON.stringify(res));
    if (res.ok) setTimeout(() => window.location.href = "index.html", 1000);
  });

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("li_email").value.trim();
    const password = document.getElementById("li_password").value;

    if (!email || !password) {
      msg.textContent = "Fill email + password.";
      return;
    }
    
    const res = await login({ email, password });
    msg.textContent = res.msg;
    console.log('login result', res);
    setAuthDebug('login result: ' + JSON.stringify(res));
    try { setAuthDebug('auth.currentUser after login: ' + JSON.stringify(window.firebase.auth.currentUser)); } catch(e) {}
    if (res.ok) setTimeout(() => window.location.href = "index.html", 1000);
  });
}

function initAddMixPage() {
  const msg = document.getElementById("msg");
  const { auth, onAuthStateChanged } = window.firebase;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    document.getElementById("createMixBtn").addEventListener("click", async () => {
      const mixName = document.getElementById("mixName").value.trim();
      
      // Collect steps
      const steps = [];
      for (let i = 1; i <= 3; i++) {
        const name = document.getElementById(`step${i}Name`).value.trim();
        const minutes = Number(document.getElementById(`step${i}Minutes`).value);
        
        if (name && Number.isFinite(minutes) && minutes > 0) {
          steps.push({
            name,
            durationMs: Math.round(minutes * 60 * 1000),
          });
        }
      }

      // Validation
      if (!mixName) {
        msg.textContent = "Please enter a mix name.";
        return;
      }
      if (steps.length === 0) {
        msg.textContent = "Please add at least one step with a valid name and duration.";
        return;
      }

      const res = await addMix({
        createdBy: user.displayName,
        createdByUid: user.uid,
        mixName,
        steps
      });
      
      if (res.ok) {
        window.location.href = "index.html";
      } else {
        msg.textContent = res.msg || "Error creating mix.";
      }
    });
  });
}
