import { auth, db } from './firebase.js';
import { logoutUser } from './auth.js';
import { softDeleteMix, nextStage, createMix, subscribeMixes, subscribeMix, advanceStage } from './mixes.js';
import { saveTemplateFromForm, subscribeTemplates, deleteTemplate } from './templates.js';
import {
    notifyStageComplete, hasBeenNotified, markNotified,
    notifyWarning, hasBeenWarned, markWarned,
    setFaviconOverdue, markCardOverdue
} from './notify.js';

// ===== CATEGORY COLOR UTILS =====
const CATEGORY_COLORS = [
    '#2f81f7', '#ff5c5c', '#3fb950', '#f2cc60', '#a259f7', '#ffb347', '#00b8d9', '#ff69b4', '#6e40c9', '#ff8c00', '#20b2aa', '#e9967a', '#4682b4', '#bada55', '#b22222', '#008080', '#b8860b', '#556b2f', '#8b008b', '#483d8b'
];

export function getCategoryColor(category) {
    if (!category) return '#666666';
    const key = category.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % CATEGORY_COLORS.length;
    return CATEGORY_COLORS[idx];
}

// ===== UTIL =====
export function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
}

export function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ===== LIVE TIMER TICKER =====
// Drives features 1–5: warning, tab title, card flash, favicon badge, done banner.
const _originalTitle = document.title;

setInterval(() => {
    let minRemaining = Infinity;
    let anyOverdue = false;

    document.querySelectorAll('[data-end-ms]').forEach(el => {
        const end = Number(el.getAttribute('data-end-ms'));
        const remaining = Math.max(0, end - Date.now());
        const mixId = el.getAttribute('data-mix-id');
        const stageIndex = el.getAttribute('data-stage-index');
        const mixName = el.getAttribute('data-mix-name') || 'A mix';
        const stageName = el.getAttribute('data-stage-name') || 'Stage';

        if (remaining === 0) {
            anyOverdue = true;

            // Feature 5: Done banner — replace timer text with styled label
            el.textContent = '⚠\uFE0F DONE';
            el.style.color = '#d73a49';
            el.style.fontWeight = 'bold';

            // Feature 3: Flash the parent mix card
            markCardOverdue(el);

            // Completion notification (once per stage)
            if (mixId && stageIndex !== null && !hasBeenNotified(mixId, stageIndex)) {
                markNotified(mixId, stageIndex);
                notifyStageComplete(mixName, stageName);
            }
        } else {
            el.textContent = formatTime(remaining);

            if (remaining <= 120_000) {
                // Feature 1: 2-min early warning (once per stage)
                if (mixId && stageIndex !== null && !hasBeenWarned(mixId, stageIndex)) {
                    markWarned(mixId, stageIndex);
                    notifyWarning(mixName, stageName, remaining);
                }
                // Color timer orange as visual cue
                el.style.color = '#d39e00';
                el.style.fontWeight = 'bold';
            } else {
                el.style.color = '';
                el.style.fontWeight = '';
            }

            if (remaining < minRemaining) minRemaining = remaining;
        }
    });

    // Feature 2: Tab title countdown
    if (anyOverdue) {
        document.title = `\u26A0\uFE0F DONE \u2014 ${_originalTitle}`;
    } else if (minRemaining !== Infinity) {
        document.title = `\u23F1 ${formatTime(minRemaining)} \u2014 ${_originalTitle}`;
    } else {
        document.title = _originalTitle;
    }

    // Feature 4: Favicon badge
    setFaviconOverdue(anyOverdue);

}, 1000);


// ===== ADD MIX PAGE =====
export function initAddMixPage() {
    let stageCounter = 1;
    let templateStageCounter = 1;

    auth.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const templatesSection = document.getElementById("templatesSection");
        const templatesList = document.getElementById("templatesList");
        const powderStagesList = document.getElementById("powderStagesList");

        // Initialize with 1 powder stage
        addPowderStageRow(powderStagesList, 1, false);

        // Add powder stage button
        document.getElementById("addPowderStageBtn")?.addEventListener("click", () => {
            stageCounter++;
            addPowderStageRow(powderStagesList, stageCounter, true);
        });

        // Create mix button
        const createMixBtn = document.getElementById("createMixBtn");
        const createMixStatus = document.getElementById("msg");
        createMixBtn.addEventListener("click", async () => {
            createMixBtn.disabled = true;
            createMixStatus.textContent = "Creating...";
            const batchNumber = document.getElementById("batchNumber").value.trim();
            const mixName = document.getElementById("mixName").value.trim();
            const description = document.getElementById("mixDescription").value.trim();
            const category = document.getElementById("mixCategory").value.trim();

            const powders = [];
            const stageInputs = powderStagesList.querySelectorAll(".stage-row");

            stageInputs.forEach((row) => {
                const stageName = row.querySelector(".stage-name").value.trim();
                const minutes = Number(row.querySelector(".stage-minutes").value);
                if (stageName && minutes > 0) {
                    powders.push({ stageName, durationMs: minutes * 60000 });
                }
            });

            if (!mixName) {
                createMixStatus.textContent = "Enter mix name";
                createMixBtn.disabled = false;
                return;
            }
            if (powders.length === 0) {
                createMixStatus.textContent = "Add at least one stage";
                createMixBtn.disabled = false;
                return;
            }

            try {
                let overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div>Creating mix...</div>';
                document.body.appendChild(overlay);

                await createMix(user, {
                    mixName,
                    batchNumber: batchNumber || null,
                    description: description || null,
                    category: category || null,
                    color: getCategoryColor(category),
                    powders
                });

                createMixStatus.textContent = "Mix created!";
                window.location.href = "index.html";
            } catch (e) {
                console.error(e);
                sessionStorage.setItem('lastErrorMsg', e.message || 'Could not create mix');
                window.location.href = 'console.html';
            } finally {
                createMixBtn.disabled = false;
                setTimeout(() => { createMixStatus.textContent = ""; }, 3000);
            }
        });

        // Load templates
        loadAndRenderTemplates(user.uid, templatesList);

        // Add template powder stage button
        document.getElementById("addTemplatePowderBtn")?.addEventListener("click", () => {
            templateStageCounter++;
            addTemplatePowderRow(document.getElementById("templatePowdersList"), templateStageCounter, true);
        });

        // Save template button
        document.getElementById("saveTemplateBtn")?.addEventListener("click", async () => {
            const templateName = document.getElementById("templateName").value.trim();
            const category = document.getElementById("templateCategory").value.trim();
            const description = document.getElementById("templateDescription").value.trim();

            const powders = [];
            document.getElementById("templatePowdersList").querySelectorAll(".template-stage-row").forEach((row) => {
                const stageName = row.querySelector(".template-stage-name").value.trim();
                const minutes = Number(row.querySelector(".template-stage-minutes").value);
                if (stageName && minutes > 0) {
                    powders.push({ stageName, durationMs: minutes * 60000 });
                }
            });

            if (!templateName) {
                document.getElementById("templateMsg").textContent = "Template name is required";
                return;
            }
            if (powders.length === 0) {
                document.getElementById("templateMsg").textContent = "Add at least one powder stage";
                return;
            }

            try {
                await saveTemplateFromForm(user.uid, {
                    templateName,
                    category: category || null,
                    description: description || null,
                    powders
                });

                // Reset form
                document.getElementById("templateName").value = "";
                document.getElementById("templateCategory").value = "";
                document.getElementById("templateDescription").value = "";
                document.getElementById("templatePowdersList").innerHTML = "";
                templateStageCounter = 1;
                addTemplatePowderRow(document.getElementById("templatePowdersList"), 1, false);

                document.getElementById("templateMsg").textContent = "Template saved!";
                setTimeout(() => { document.getElementById("templateMsg").textContent = ""; }, 2000);

                loadAndRenderTemplates(user.uid, templatesList);
            } catch (e) {
                console.error(e);
                document.getElementById("templateMsg").textContent = e.message;
            }
        });

        // Show templates section
        templatesSection.style.display = "block";

        // Initialize template powder list with 1 stage
        addTemplatePowderRow(document.getElementById("templatePowdersList"), 1, false);
    });
}

function addPowderStageRow(container, stageNum, canRemove) {
    const row = document.createElement("div");
    row.className = "stage-row";
    row.style.cssText = "display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-end;";

    const nameField = document.createElement("div");
    nameField.className = "field";
    nameField.style.flex = "1";
    nameField.innerHTML = `
    <label>Stage ${stageNum} - Name</label>
    <input class="stage-name" placeholder="e.g. Powder ${stageNum}" value="Powder ${stageNum}" />
  `;

    const minutesField = document.createElement("div");
    minutesField.className = "field";
    minutesField.style.flex = "1";
    minutesField.innerHTML = `
    <label>Stage ${stageNum} - Duration (minutes)</label>
    <input class="stage-minutes" type="number" min="1" step="1" placeholder="e.g. 30" />
  `;

    row.appendChild(nameField);
    row.appendChild(minutesField);

    if (canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn";
        removeBtn.textContent = "Remove";
        removeBtn.style.cssText = "height: fit-content; margin-bottom: 0;";
        removeBtn.addEventListener("click", () => row.remove());
        row.appendChild(removeBtn);
    }

    container.appendChild(row);
}

function addTemplatePowderRow(container, stageNum, canRemove) {
    const row = document.createElement("div");
    row.className = "template-stage-row";
    row.style.cssText = "display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-end;";

    const nameField = document.createElement("div");
    nameField.className = "field";
    nameField.style.flex = "1";
    nameField.innerHTML = `
    <label>Powder ${stageNum} - Name</label>
    <input class="template-stage-name" placeholder="e.g. Powder ${stageNum}" value="Powder ${stageNum}" />
  `;

    const minutesField = document.createElement("div");
    minutesField.className = "field";
    minutesField.style.flex = "1";
    minutesField.innerHTML = `
    <label>Powder ${stageNum} - Duration (minutes)</label>
    <input class="template-stage-minutes" type="number" min="1" step="1" placeholder="e.g. 30" />
  `;

    row.appendChild(nameField);
    row.appendChild(minutesField);

    if (canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn";
        removeBtn.textContent = "Remove";
        removeBtn.style.cssText = "height: fit-content; margin-bottom: 0;";
        removeBtn.addEventListener("click", () => row.remove());
        row.appendChild(removeBtn);
    }

    container.appendChild(row);
}

function loadAndRenderTemplates(userId, container) {
    subscribeTemplates(userId, (snapshot) => {
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = "<p style='color: #666;'>No templates saved yet. Create one below!</p>";
            return;
        }

        const list = document.createElement("div");
        list.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

        snapshot.forEach((doc) => {
            const template = doc.data();
            const item = document.createElement("div");
            item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f5f5f5; border-radius: 4px; border-left: 4px solid " + (template.color || "#666666") + ";";

            const info = document.createElement("div");
            info.style.flex = "1";
            info.innerHTML = `
        <strong style='color:#111;'>${template.templateName}</strong>
        ${template.category ? `<br><small style="color: #666;">${template.category}</small>` : ""}
        <br><small style="color: #999;">${template.powders.length} stages</small>
      `;

            const btns = document.createElement("div");
            btns.style.cssText = "display: flex; gap: 8px;";

            const quickAddBtn = document.createElement("button");
            quickAddBtn.className = "btn primary";
            quickAddBtn.textContent = "Quick Add";
            quickAddBtn.style.fontSize = "0.9em";
            quickAddBtn.addEventListener("click", async () => {
                try {
                    const user = auth.currentUser;
                    let batchNumber = prompt("Batch number (optional):", "");
                    if (batchNumber === null) return;
                    batchNumber = batchNumber.trim();

                    let overlay = document.createElement('div');
                    overlay.className = 'loading-overlay';
                    overlay.innerHTML = '<div>Creating mix...</div>';
                    document.body.appendChild(overlay);

                    await createMix(user, {
                        mixName: template.templateName,
                        batchNumber: batchNumber || null,
                        description: template.description || null,
                        category: template.category || null,
                        color: getCategoryColor(template.category),
                        powders: template.powders
                    });
                    window.location.href = "index.html";
                } catch (e) {
                    console.error(e);
                    sessionStorage.setItem('lastErrorMsg', e.message || 'Could not create mix from template');
                    window.location.href = 'console.html';
                }
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn danger";
            deleteBtn.textContent = "Delete";
            deleteBtn.style.fontSize = "0.9em";
            deleteBtn.addEventListener("click", async () => {
                if (confirm("Delete this template?")) {
                    try {
                        await deleteTemplate(doc.id);
                    } catch (e) {
                        console.error(e);
                        alert(e.message);
                    }
                }
            });

            btns.appendChild(quickAddBtn);
            btns.appendChild(deleteBtn);
            item.appendChild(info);
            item.appendChild(btns);
            list.appendChild(item);
        });

        container.appendChild(list);
    });
}


// ===== MIX DETAIL PAGE =====
export function initMixDetailPage() {
    const userBadge = document.getElementById("userBadge");
    const mixContent = document.getElementById("mixContent");
    const errorMsg = document.getElementById("errorMsg");

    const params = new URLSearchParams(window.location.search);
    const mixId = params.get("id");

    if (!mixId) {
        errorMsg.textContent = "No mix ID provided";
        return;
    }

    auth.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        userBadge.textContent = user.displayName || user.email;

        subscribeMix(
            mixId,
            (doc) => {
                if (!doc.exists) { errorMsg.textContent = "Mix not found"; return; }
                const mix = { id: doc.id, ...doc.data() };
                if (mix.isDeleted) { errorMsg.textContent = "This mix has been deleted"; return; }
                renderMixDetail(mix, user, mixContent, errorMsg, mixId);
            },
            (error) => {
                console.error(error);
                errorMsg.textContent = "Error loading mix: " + error.message;
            }
        );
    });
}

function renderMixDetail(mix, user, mixContent, errorMsg, mixId) {
    mixContent.innerHTML = "";
    errorMsg.textContent = "";

    const now = Date.now();
    const currentStage = mix.powders[mix.currentStageIndex];
    const stageEnd = mix.currentStageStartedAtMs + (currentStage?.durationMs || 0);
    const remaining = Math.max(0, stageEnd - now);

    // Header
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid " + (mix.color || "#666666");
    let titleHtml = escapeHtml(mix.mixName);
    if (mix.batchNumber) titleHtml = escapeHtml(mix.batchNumber) + " - " + titleHtml;
    header.innerHTML = `
    <h1 style="margin: 0 0 5px 0; color: ${mix.color || '#333'};">${titleHtml}</h1>
    ${mix.category ? `<p style="margin: 5px 0; color: #666;"><strong>Category:</strong> ${escapeHtml(mix.category)}</p>` : ""}
    <p style="margin: 5px 0; color: #999;"><strong>Created by:</strong> ${escapeHtml(mix.createdByName || mix.createdByEmail || "Unknown")}</p>
  `;
    mixContent.appendChild(header);

    // Description
    if (mix.description) {
        const descDiv = document.createElement("div");
        descDiv.style.cssText = "margin-bottom: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px;";
        descDiv.innerHTML = `<p style="margin: 0;"><strong>Description:</strong> ${escapeHtml(mix.description)}</p>`;
        mixContent.appendChild(descDiv);
    }

    // Current stage
    if (currentStage) {
        const stageDiv = document.createElement("div");
        stageDiv.style.cssText = "margin-bottom: 20px; padding: 15px; background: #e8f4f8; border-radius: 4px; border-left: 4px solid #17a2b8;";
        stageDiv.innerHTML = `
      <h2 style="margin: 0 0 10px 0;">Current Stage</h2>
      <p style="margin: 5px 0;"><strong>${escapeHtml(currentStage.stageName)}</strong> (${mix.currentStageIndex + 1} of ${mix.powders.length})</p>
      <p style="margin: 5px 0; font-size: 1.2em;"><strong>Time remaining:</strong> <span
        data-end-ms="${stageEnd}"
        data-mix-id="${mix.id}"
        data-stage-index="${mix.currentStageIndex}"
        data-mix-name="${escapeHtml(mix.mixName)}"
        data-stage-name="${escapeHtml(currentStage.stageName)}"
      >${formatTime(remaining)}</span></p>
      <p style="margin: 5px 0; color: #666;">${remaining === 0 ? "Stage complete!" : "In progress"}</p>
    `;
        mixContent.appendChild(stageDiv);
    }

    // All stages list
    const stagesDiv = document.createElement("div");
    stagesDiv.style.cssText = "margin-bottom: 20px;";
    stagesDiv.innerHTML = "<h3>All Stages</h3>";

    const stagesList = document.createElement("ul");
    stagesList.style.cssText = "list-style: none; padding: 0; margin: 0;";

    mix.powders.forEach((stage, idx) => {
        const li = document.createElement("li");
        li.style.cssText = `
      padding: 10px; margin-bottom: 8px; background: ${idx === mix.currentStageIndex ? '#fff3cd' : '#f9f9f9'};
      border-left: 3px solid ${idx === mix.currentStageIndex ? '#ffc107' : '#ddd'}; border-radius: 2px;
    `;
        const durationMin = Math.floor(stage.durationMs / 60000);
        li.innerHTML = `
      <strong>${escapeHtml(stage.stageName)}</strong> - ${durationMin} min
      ${idx === mix.currentStageIndex ? '<span style="margin-left: 10px; color: #d39e00; font-weight: bold;">← Current</span>' : ''}
    `;
        stagesList.appendChild(li);
    });

    stagesDiv.appendChild(stagesList);
    mixContent.appendChild(stagesDiv);

    // Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = "display: flex; gap: 10px; margin-top: 20px;";

    if (mix.currentStageIndex < mix.powders.length - 1) {
        const nextBtn = document.createElement("button");
        nextBtn.className = "btn primary";
        nextBtn.textContent = "Next Stage";
        nextBtn.addEventListener("click", async () => {
            try {
                await advanceStage(mixId, mix.currentStageIndex);
            } catch (e) {
                console.error(e);
                errorMsg.textContent = "Error advancing stage: " + e.message;
            }
        });
        actionsDiv.appendChild(nextBtn);
    } else {
        const completeMsg = document.createElement("p");
        completeMsg.style.cssText = "color: #28a745; font-weight: bold; margin: 0;";
        completeMsg.textContent = "All stages complete!";
        actionsDiv.appendChild(completeMsg);
    }

    if (user.uid === mix.createdByUid) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn danger";
        deleteBtn.textContent = "Delete Mix";
        deleteBtn.addEventListener("click", async () => {
            if (confirm("Delete this mix?")) {
                try {
                    await softDeleteMix(mixId);
                    window.location.href = "index.html";
                } catch (e) {
                    console.error(e);
                    errorMsg.textContent = "Error deleting mix: " + e.message;
                }
            }
        });
        actionsDiv.appendChild(deleteBtn);
    }

    mixContent.appendChild(actionsDiv);
}


// ===== INDEX PAGE =====
export function initIndexPage() {
    const userBadge = document.getElementById("userBadge");
    const loginLink = document.getElementById("loginLink");
    const logoutBtn = document.getElementById("logoutBtn");
    const mixRows = document.getElementById("mixRows");
    const mixesState = document.getElementById("mixes-state");
    const teamTabBtn = document.getElementById("teamTabBtn");
    const myTabBtn = document.getElementById("myTabBtn");

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    let currentUser = null;
    let currentTab = "team";
    let allMixes = [];
    let unsubscribe = null;

    logoutBtn?.addEventListener("click", async () => { await logoutUser(); });

    teamTabBtn?.addEventListener("click", () => { currentTab = "team"; updateTabStyle(); renderMixes(); });
    myTabBtn?.addEventListener("click", () => { currentTab = "my"; updateTabStyle(); renderMixes(); });

    function updateTabStyle() {
        if (currentTab === "team") {
            teamTabBtn.style.borderBottom = "3px solid #007bff"; teamTabBtn.style.color = "#007bff";
            myTabBtn.style.borderBottom = "3px solid transparent"; myTabBtn.style.color = "#666";
        } else {
            teamTabBtn.style.borderBottom = "3px solid transparent"; teamTabBtn.style.color = "#666";
            myTabBtn.style.borderBottom = "3px solid #007bff"; myTabBtn.style.color = "#007bff";
        }
    }

    auth.onAuthStateChanged((user) => {
        if (mixesState) { mixesState.textContent = "Loading mixes..."; mixRows.innerHTML = ""; }
        currentUser = user;

        if (user) {
            userBadge.textContent = user.displayName || user.email;
            loginLink.style.display = "none";
            logoutBtn.style.display = "inline-flex";
            teamTabBtn.style.display = "inline-block";
            myTabBtn.style.display = "inline-block";

            unsubscribe = subscribeMixes(
                (snapshot) => {
                    if (mixesState) mixesState.textContent = "";
                    allMixes = [];
                    snapshot.forEach((doc) => allMixes.push({ id: doc.id, ...doc.data() }));
                    renderMixes();
                },
                (error) => {
                    if (mixesState) mixesState.textContent = "Error loading mixes.";
                    console.error("Mixes subscription error:", error);
                }
            );

            updateTabStyle();
        } else {
            userBadge.textContent = "Not logged in";
            loginLink.style.display = "inline-flex";
            logoutBtn.style.display = "none";
            teamTabBtn.style.display = "none";
            myTabBtn.style.display = "none";
            if (mixesState) mixesState.textContent = "";
            mixRows.innerHTML = "<p style='color: #999;'>Please log in to view mixes</p>";
            if (unsubscribe) unsubscribe();
        }
    });

    function renderMixes() {
        let mixes = currentTab === "team"
            ? allMixes.filter(mix => mix.createdByUid !== currentUser.uid)
            : allMixes.filter(mix => mix.createdByUid === currentUser.uid);
        renderTable(mixes);
    }

    function renderTable(mixes) {
        mixRows.innerHTML = "";
        if (mixesState) mixesState.textContent = "";

        if (mixes.length === 0) {
            const emptyMsg = currentTab === "team"
                ? "No mixes from teammates yet"
                : "No mixes created by you yet. Start by adding one!";
            if (mixesState) mixesState.textContent = emptyMsg;
            return;
        }

        const now = Date.now();
        const groupedByColor = {};

        mixes.forEach((mix) => {
            if (mix.isDeleted) return;
            const stage = mix.powders[mix.currentStageIndex];
            if (!stage) return;

            const end = mix.currentStageStartedAtMs + stage.durationMs;
            const remaining = Math.max(0, end - now);
            const color = mix.color || "#666666";
            const category = mix.category || "Uncategorised";
            const groupKey = category;

            if (!groupedByColor[groupKey]) groupedByColor[groupKey] = { color, items: [] };
            groupedByColor[groupKey].items.push({
                id: mix.id,
                createdByName: mix.createdByName || mix.createdByEmail || "Unknown",
                mixName: mix.mixName,
                batchNumber: mix.batchNumber || null,
                category: mix.category,
                description: mix.description,
                stageName: stage.stageName,
                currentStageIndex: mix.currentStageIndex,
                totalStages: mix.powders.length,
                remaining,
                isDone: remaining === 0,
                createdByUid: mix.createdByUid,
                color
            });
        });

        Object.keys(groupedByColor).forEach(key => {
            groupedByColor[key].items.sort((a, b) => a.remaining - b.remaining);
        });

        Object.keys(groupedByColor).sort().forEach(categoryKey => {
            const { color, items } = groupedByColor[categoryKey];
            const groupDiv = document.createElement("div");
            groupDiv.style.cssText = "border-left: 5px solid " + color + "; padding: 15px; background: #fafafa; border-radius: 4px;";

            const heading = document.createElement("h3");
            heading.style.cssText = "margin-top: 0; margin-bottom: 15px; color: " + color + ";";
            heading.textContent = categoryKey;
            groupDiv.appendChild(heading);

            const mixesContainer = document.createElement("div");
            mixesContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

            items.forEach(mix => {

                const mixItem = document.createElement("div");
                mixItem.setAttribute('data-mix-card', ''); // needed for card flash (Feature 3)
                mixItem.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 4px; border: 1px solid #ddd; cursor: pointer; transition: background-color 0.2s;";
                mixItem.onmouseover = () => mixItem.style.backgroundColor = "#f9f9f9";
                mixItem.onmouseout = () => mixItem.style.backgroundColor = "white";

                const infoDiv = document.createElement("div");
                infoDiv.style.flex = "1";
                infoDiv.style.cursor = "pointer";
                infoDiv.onclick = () => window.location.href = "mix.html?id=" + mix.id;

                const title = document.createElement("strong");
                let titleText = escapeHtml(mix.mixName);
                if (mix.batchNumber) titleText = escapeHtml(mix.batchNumber) + " - " + titleText;
                title.textContent = titleText;
                title.style.color = '#111';
                infoDiv.appendChild(title);

                if (mix.category) {
                    const catSpan = document.createElement("span");
                    catSpan.style.cssText = "display: block; font-size: 0.85em; color: #666; margin-top: 4px;";
                    catSpan.textContent = "Category: " + escapeHtml(mix.category);
                    infoDiv.appendChild(catSpan);
                }

                const details = document.createElement("span");
                details.style.cssText = "display: block; font-size: 0.9em; color: #888; margin-top: 4px;";
                details.innerHTML = `
          <strong>Stage:</strong> ${escapeHtml(mix.stageName)} (${mix.currentStageIndex + 1}/${mix.totalStages}) | 
          <strong>Creator:</strong> ${escapeHtml(mix.createdByName)} | 
          <strong>Time left:</strong> <span
            data-end-ms="${Date.now() + mix.remaining}"
            data-mix-id="${mix.id}"
            data-stage-index="${mix.currentStageIndex}"
            data-mix-name="${escapeHtml(mix.mixName)}"
            data-stage-name="${escapeHtml(mix.stageName)}"
          >${formatTime(mix.remaining)}</span> | 
          <strong>Status:</strong> ${mix.isDone ? "Done" : "Running"}
        `;
                infoDiv.appendChild(details);

                const actionsDiv = document.createElement("div");
                actionsDiv.style.cssText = "display: flex; gap: 8px; margin-left: 15px;";

                const nextBtn = document.createElement("button");
                nextBtn.className = "btn";
                nextBtn.textContent = "Next";
                nextBtn.style.fontSize = "0.9em";
                nextBtn.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        await nextStage(mix.id, mix.currentStageIndex, mix.totalStages);
                    } catch (err) {
                        console.error(err);
                        alert("Error advancing stage: " + err.message);
                    }
                };
                actionsDiv.appendChild(nextBtn);

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "btn danger";
                deleteBtn.textContent = "Delete";
                deleteBtn.style.fontSize = "0.9em";
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (currentUser && currentUser.uid === mix.createdByUid) {
                        if (confirm("Delete this mix?")) {
                            try { softDeleteMix(mix.id); }
                            catch (err) { console.error(err); alert("Error deleting mix: " + err.message); }
                        }
                    } else {
                        alert("You can only delete your own mixes");
                    }
                };
                actionsDiv.appendChild(deleteBtn);

                mixItem.appendChild(infoDiv);
                mixItem.appendChild(actionsDiv);
                mixesContainer.appendChild(mixItem);
            });

            groupDiv.appendChild(mixesContainer);
            mixRows.appendChild(groupDiv);
        });
    }
}


// ===== ACCOUNT PAGE =====
export function initAccountPage() {
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
