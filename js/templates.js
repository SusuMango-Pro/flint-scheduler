import { auth, db } from './firebase.js';

// ===== SAVE AS TEMPLATE =====
export async function saveAsTemplate(mixId, templateName) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const mixDoc = await db.collection("mixes").doc(mixId).get();
        const mixData = mixDoc.data();

        await db.collection("templates").add({
            userId: user.uid,
            templateName,
            category: mixData.category || null,
            color: mixData.color || "#666666",
            description: mixData.description || null,
            components: mixData.components || mixData.powders || [],
            createdAtMs: Date.now()
        });

        alert("Template saved!");
    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

// ===== CREATE MIX FROM TEMPLATE =====
export async function createMixFromTemplate(templateId) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const templateDoc = await db.collection("templates").doc(templateId).get();
        const templateData = templateDoc.data();

        const newMix = await db.collection("mixes").add({
            createdByUid: user.uid,
            createdByEmail: user.email,
            createdByName: user.displayName || null,
            mixName: templateData.templateName,
            description: templateData.description || null,
            category: templateData.category || null,
            color: templateData.color || "#666666",
            components: templateData.components || templateData.powders || [],
            currentStageIndex: 0,
            currentStageStartedAtMs: Date.now(),
            createdAtMs: Date.now(),
            isDeleted: false
        });

        return newMix.id;
    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

// ===== DELETE TEMPLATE =====
export async function deleteTemplate(templateId) {
    try {
        await db.collection("templates").doc(templateId).delete();
    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

// ===== SAVE NEW TEMPLATE FROM FORM =====
export async function saveTemplateFromForm(userId, formData) {
    return db.collection("templates").add({
        userId,
        ...formData,
        createdAtMs: Date.now()
    });
}

// ===== SUBSCRIBE TO USER'S TEMPLATES =====
export function subscribeTemplates(userId, callback) {
    return db.collection("templates")
        .where("userId", "==", userId)
        .onSnapshot(callback);
}
