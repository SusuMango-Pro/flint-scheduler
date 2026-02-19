// ===== Firebase init =====
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

export const auth = firebase.auth();
export const db = firebase.firestore();
