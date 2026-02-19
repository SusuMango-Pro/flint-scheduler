import { db } from './firebase.js';

// ===== SOFT DELETE =====
export async function softDeleteMix(mixId) {
    try {
        await db.collection("mixes").doc(mixId).update({ isDeleted: true });
    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

// ===== NEXT STAGE =====
export async function nextStage(id, currentIndex, total) {
    if (currentIndex >= total - 1) return;
    await db.collection("mixes").doc(id).update({
        currentStageIndex: currentIndex + 1,
        currentStageStartedAtMs: Date.now()
    });
}

// ===== CREATE MIX =====
export async function createMix(user, mixData) {
    return db.collection("mixes").add({
        createdByUid: user.uid,
        createdByEmail: user.email,
        createdByName: user.displayName || null,
        ...mixData,
        currentStageIndex: 0,
        currentStageStartedAtMs: Date.now(),
        createdAtMs: Date.now(),
        isDeleted: false
    });
}

// ===== SUBSCRIBE TO ALL ACTIVE MIXES =====
export function subscribeMixes(onUpdate, onError) {
    return db.collection("mixes")
        .where("isDeleted", "==", false)
        .onSnapshot(onUpdate, onError);
}

// ===== GET SINGLE MIX =====
export function subscribeMix(mixId, onUpdate, onError) {
    return db.collection("mixes").doc(mixId).onSnapshot(onUpdate, onError);
}

// ===== ADVANCE STAGE FROM MIX DETAIL PAGE =====
export async function advanceStage(mixId, currentStageIndex, totalStages) {
    if (currentStageIndex >= totalStages - 1) return;
    return db.collection("mixes").doc(mixId).update({
        currentStageIndex: currentStageIndex + 1,
        currentStageStartedAtMs: Date.now()
    });
}
