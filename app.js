// ===== Firebase init (ONLY ONCE) =====
const firebaseConfig = {
  apiKey: "AIzaSyDp7TN2BttsFGRjYE-ZjT5t8gMl3z4c4CI",
  authDomain: "flint-mix-scheduler-18f59.firebaseapp.com",
  projectId: "flint-mix-scheduler-18f59",
  storageBucket: "flint-mix-scheduler-18f59.firebasestorage.app",
  messagingSenderId: "536576866030",
  appId: "1:536576866030:web:00d576009813dd02c965ff"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

window.firebase = { auth, db };


// ===== AUTH FUNCTIONS =====
async function signup(email, password, username) {
  const userCred = await auth.createUserWithEmailAndPassword(email, password);
  if (username) {
    await userCred.user.updateProfile({ displayName: username });
  }
}

async function login(email, password) {
  await auth.signInWithEmailAndPassword(email, password);
}

async function logoutUser() {
  await auth.signOut();
}


// ===== LOGIN PAGE =====
function initLoginPage() {
  const msg = document.getElementById("msg");

  document.getElementById("signupBtn")?.addEventListener("click", async () => {
    const username = document.getElementById("su_username").value.trim();
    const email = document.getElementById("su_email").value.trim();
    const password = document.getElementById("su_password").value;

    try {
      await signup(email, password, username);
      msg.textContent = "Account created!";
      window.location.href = "index.html";
    } catch (e) {
      msg.textContent = e.message;
    }
  });

  document.getElementById("loginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("li_email").value.trim();
    const password = document.getElementById("li_password").value;

    try {
      await login(email, password);
      msg.textContent = "Logged in!";
      window.location.href = "index.html";
    } catch (e) {
      msg.textContent = e.message;
    }
  });
}


// ===== ADD MIX PAGE =====
function initAddMixPage() {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    document.getElementById("createMixBtn")?.addEventListener("click", async () => {
      const mixName = document.getElementById("mixName").value.trim();

      const steps = [];
      for (let i = 1; i <= 3; i++) {
        const name = document.getElementById(`step${i}Name`).value.trim();
        const minutes = Number(document.getElementById(`step${i}Minutes`).value);

        if (name && minutes > 0) {
          steps.push({
            name,
            durationMs: minutes * 60000
          });
        }
      }

      if (!mixName) {
        alert("Enter mix name");
        return;
      }

      if (steps.length === 0) {
        alert("Add at least one step");
        return;
      }

      try {
        await db.collection("mixes").add({
          createdBy: user.displayName || user.email,
          createdByUid: user.uid,
          mixName,
          steps,
          currentStepIndex: 0,
          currentStepStartedAtMs: Date.now()
        });

        window.location.href = "index.html";
      } catch (e) {
        console.error(e);
        alert(e.message);
      }
    });
  });
}


// ===== INDEX PAGE =====
function initIndexPage() {
  const userBadge = document.getElementById("userBadge");
  const loginLink = document.getElementById("loginLink");
  const logoutBtn = document.getElementById("logoutBtn");
  const mixRows = document.getElementById("mixRows");

  let currentUser = null;

  logoutBtn?.addEventListener("click", async () => {
    await logoutUser();
  });

  auth.onAuthStateChanged((user) => {
    currentUser = user;

    if (user) {
      userBadge.textContent = user.displayName || user.email;
      loginLink.style.display = "none";
      logoutBtn.style.display = "inline-flex";

      subscribeToMixes(renderTable);
    } else {
      userBadge.textContent = "Not logged in";
      loginLink.style.display = "inline-flex";
      logoutBtn.style.display = "none";
      mixRows.innerHTML = "";
    }
  });

  function renderTable(mixes) {
    mixRows.innerHTML = "";

    const now = Date.now();

    mixes.forEach((mix) => {
      const step = mix.steps[mix.currentStepIndex];
      if (!step) return;

      const end = mix.currentStepStartedAtMs + step.durationMs;
      const remaining = Math.max(0, end - now);

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${mix.createdBy}</td>
        <td>${mix.mixName}</td>
        <td>${step.name}</td>
        <td>${mix.currentStepIndex + 1}/${mix.steps.length}</td>
        <td>${formatTime(remaining)}</td>
        <td>${remaining === 0 ? "Done" : "Running"}</td>
        <td>
          <button onclick="nextStep('${mix.id}', ${mix.currentStepIndex}, ${mix.steps.length})">
            Next
          </button>
        </td>
      `;

      mixRows.appendChild(tr);
    });
  }
}


// ===== FIRESTORE =====
function subscribeToMixes(callback) {
  return db.collection("mixes").onSnapshot((snapshot) => {
    const mixes = [];
    snapshot.forEach((doc) => {
      mixes.push({ id: doc.id, ...doc.data() });
    });
    callback(mixes);
  });
}


// ===== NEXT STEP =====
async function nextStep(id, currentIndex, total) {
  if (currentIndex >= total - 1) return;

  await db.collection("mixes").doc(id).update({
    currentStepIndex: currentIndex + 1,
    currentStepStartedAtMs: Date.now()
  });
}


// ===== ACCOUNT PAGE =====
function initAccountPage() {
  const panel = document.getElementById("accountPanel");

  auth.onAuthStateChanged((user) => {
    if (!user) {
      panel.innerHTML = "Not logged in";
      return;
    }

    panel.innerHTML = `
      <p><strong>${user.displayName || user.email}</strong></p>
      <button id="logoutBtn2">Logout</button>
    `;

    document.getElementById("logoutBtn2").addEventListener("click", async () => {
      await logoutUser();
      window.location.href = "login.html";
    });
  });
}


// ===== UTIL =====
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}
