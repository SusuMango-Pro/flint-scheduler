// main.js — detects current page and calls the correct init function
import { initLoginPage } from './js/auth.js';
import { initAddMixPage, initIndexPage, initMixDetailPage, initAccountPage } from './js/ui.js';
import { initNotifyUI } from './js/notify.js';

// Show notification permission banner on every page (if not yet granted/denied)
initNotifyUI();


const page = window.location.pathname.split('/').pop() || 'index.html';

if (page === 'login.html') {
    initLoginPage();
} else if (page === 'add.html') {
    initAddMixPage();
} else if (page === 'mix.html') {
    initMixDetailPage();
} else if (page === 'account.html') {
    initAccountPage();
} else {
    // index.html (or root)
    initIndexPage();
}
