import { auth } from './firebase.js';

// ===== AUTH FUNCTIONS =====
export async function signup(email, password, username) {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    if (username) {
        await userCred.user.updateProfile({ displayName: username });
    }
}

export async function login(email, password) {
    await auth.signInWithEmailAndPassword(email, password);
}

export async function logoutUser() {
    await auth.signOut();
}

// ===== LOGIN PAGE =====
export function initLoginPage() {
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

    const loginBtn = document.getElementById("loginBtn");
    const loginStatus = document.getElementById("login-status");
    if (loginBtn && loginStatus) {
        loginBtn.addEventListener("click", async () => {
            const email = document.getElementById("li_email").value.trim();
            const password = document.getElementById("li_password").value;
            loginBtn.disabled = true;
            loginStatus.textContent = "Logging in...";

            let overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div>Logging you in...</div>';
            document.body.appendChild(overlay);

            try {
                await login(email, password);
                loginStatus.textContent = "";
                msg.textContent = "Logged in!";
                window.location.href = "index.html";
            } catch (e) {
                sessionStorage.setItem('lastErrorMsg', e.message || 'Unknown error');
                window.location.href = 'console.html';
            } finally {
                loginBtn.disabled = false;
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        });
    }
}
