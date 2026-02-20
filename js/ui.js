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
    '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#22d3ee'
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
    const sTotal = Math.floor(ms / 1000);
    const mTotal = Math.floor(sTotal / 60);
    const hTotal = Math.floor(mTotal / 60);
    const d = Math.floor(hTotal / 24);

    const s = sTotal % 60;
    const m = mTotal % 60;
    const h = hTotal % 24;

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
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
        const stageName = el.getAttribute('data-stage-name') || 'Component';

        if (remaining === 0) {
            anyOverdue = true;

            // Feature 5: Done banner — replace timer text with styled label + overdue time
            const overdueMs = Date.now() - end;
            el.textContent = `⚠\uFE0F DONE (+ ${formatTime(overdueMs)})`;
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
        const componentStagesList = document.getElementById("componentStagesList");

        // Initialize with 1 component stage
        addComponentStageRow(componentStagesList, 1, false);

        // Add component stage button
        document.getElementById("addComponentStageBtn")?.addEventListener("click", () => {
            stageCounter++;
            addComponentStageRow(componentStagesList, stageCounter, true);
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

            const components = [];
            const stageInputs = componentStagesList.querySelectorAll(".stage-row");

            stageInputs.forEach((row) => {
                const stageName = row.querySelector(".stage-name").value.trim();
                const minutes = Number(row.querySelector(".stage-minutes").value);
                if (stageName && minutes > 0) {
                    components.push({ stageName, durationMs: minutes * 60000 });
                }
            });

            if (!mixName) {
                createMixStatus.textContent = "Enter mix name";
                createMixBtn.disabled = false;
                return;
            }
            if (components.length === 0) {
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
                    components
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

        // Add template component stage button
        document.getElementById("addTemplateComponentBtn")?.addEventListener("click", () => {
            templateStageCounter++;
            addTemplateComponentRow(document.getElementById("templateComponentsList"), templateStageCounter, true);
        });

        // Save template button
        document.getElementById("saveTemplateBtn")?.addEventListener("click", async () => {
            const templateName = document.getElementById("templateName").value.trim();
            const category = document.getElementById("templateCategory").value.trim();
            const description = document.getElementById("templateDescription").value.trim();

            const components = [];
            document.getElementById("templateComponentsList").querySelectorAll(".template-stage-row").forEach((row) => {
                const stageName = row.querySelector(".template-stage-name").value.trim();
                const minutes = Number(row.querySelector(".template-stage-minutes").value);
                if (stageName && minutes > 0) {
                    components.push({ stageName, durationMs: minutes * 60000 });
                }
            });

            if (!templateName) {
                document.getElementById("templateMsg").textContent = "Template name is required";
                return;
            }
            if (components.length === 0) {
                document.getElementById("templateMsg").textContent = "Add at least one component stage";
                return;
            }

            try {
                await saveTemplateFromForm(user.uid, {
                    templateName,
                    category: category || null,
                    description: description || null,
                    components
                });

                // Reset form
                document.getElementById("templateName").value = "";
                document.getElementById("templateCategory").value = "";
                document.getElementById("templateDescription").value = "";
                document.getElementById("templateComponentsList").innerHTML = "";
                templateStageCounter = 1;
                addTemplateComponentRow(document.getElementById("templateComponentsList"), 1, false);

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

        // Initialize template component list with 1 stage
        addTemplateComponentRow(document.getElementById("templateComponentsList"), 1, false);
    });
}

function addComponentStageRow(container, stageNum, canRemove) {
    const row = document.createElement("div");
    row.className = "stage-row fade-in";
    row.style.cssText = "display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end;";

    const nameField = document.createElement("div");
    nameField.className = "field";
    nameField.style.flex = "2";
    nameField.innerHTML = `
    <label>Component ${stageNum}</label>
    <input class="stage-name" placeholder="Name" value="Component ${stageNum}" />
  `;

    const minutesField = document.createElement("div");
    minutesField.className = "field";
    minutesField.style.flex = "1";
    minutesField.innerHTML = `
    <label>Duration (min)</label>
    <input class="stage-minutes" type="number" min="1" step="1" placeholder="30" />
  `;

    row.appendChild(nameField);
    row.appendChild(minutesField);

    if (canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn danger small";
        removeBtn.textContent = "Remove";
        removeBtn.style.marginBottom = "0";
        removeBtn.addEventListener("click", () => row.remove());
        row.appendChild(removeBtn);
    }

    container.appendChild(row);
}

function addTemplateComponentRow(container, stageNum, canRemove) {
    const row = document.createElement("div");
    row.className = "template-stage-row fade-in";
    row.style.cssText = "display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end;";

    const nameField = document.createElement("div");
    nameField.className = "field";
    nameField.style.flex = "2";
    nameField.innerHTML = `
    <label>Component ${stageNum}</label>
    <input class="template-stage-name" placeholder="Name" value="Component ${stageNum}" />
  `;

    const minutesField = document.createElement("div");
    minutesField.className = "field";
    minutesField.style.flex = "1";
    minutesField.innerHTML = `
    <label>Duration (min)</label>
    <input class="template-stage-minutes" type="number" min="1" step="1" placeholder="30" />
  `;

    row.appendChild(nameField);
    row.appendChild(minutesField);

    if (canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn danger small";
        removeBtn.textContent = "Remove";
        removeBtn.style.marginBottom = "0";
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
            const stages = template.components || template.powders || [];
            const item = document.createElement("div");
            item.className = "fade-in";
            item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--surface-elevated); border-radius: 12px; border-left: 4px solid " + (template.color || "var(--primary)") + "; margin-bottom: 12px;";

            const info = document.createElement("div");
            info.style.flex = "1";
            info.innerHTML = `
        <strong style='color: var(--text); font-size: 1.1rem;'>${template.templateName}</strong>
        ${template.category ? `<br><span style="color: var(--primary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${template.category}</span>` : ""}
        <br><span style="color: var(--text-dim); font-size: 0.85rem;">${stages.length} components</span>
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

                    const stages = template.components || template.powders || [];
                    await createMix(user, {
                        mixName: template.templateName,
                        batchNumber: batchNumber || null,
                        description: template.description || null,
                        category: template.category || null,
                        color: getCategoryColor(template.category),
                        components: stages
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
    const stages = mix.components || mix.powders || [];
    const currentStage = stages[mix.currentStageIndex];
    const stageEnd = mix.currentStageStartedAtMs + (currentStage?.durationMs || 0);
    const remaining = Math.max(0, stageEnd - now);

    // Header
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid var(--border);";
    let titleHtml = escapeHtml(mix.mixName);
    if (mix.batchNumber) titleHtml = `<span style="color: var(--text-muted); font-weight: 400;">${escapeHtml(mix.batchNumber)}</span> <span style="color: var(--border); margin: 0 8px;">/</span> ` + titleHtml;
    header.innerHTML = `
    <h1 style="margin: 0 0 12px 0; font-size: 2rem; color: ${mix.color || 'var(--text)'};">${titleHtml}</h1>
    <div style="display: flex; gap: 16px; align-items: center;">
      ${mix.category ? `<span class="badge" style="border-color: ${mix.color || 'var(--primary)'}; color: ${mix.color || 'var(--primary)'};">${escapeHtml(mix.category)}</span>` : ""}
      <span style="font-size: 0.9rem; color: var(--text-muted);">Created by ${escapeHtml(mix.createdByName || mix.createdByEmail || "Unknown")}</span>
    </div>
  `;
    mixContent.appendChild(header);

    // Description
    if (mix.description) {
        const descDiv = document.createElement("div");
        descDiv.style.cssText = "margin-bottom: 32px; padding: 16px; background: var(--surface-elevated); border-radius: 12px; border: 1px solid var(--border);";
        descDiv.innerHTML = `<p style="margin: 0; color: var(--text-muted); font-style: italic;">"${escapeHtml(mix.description)}"</p>`;
        mixContent.appendChild(descDiv);
    }

    // Current stage
    if (currentStage) {
        const stageDiv = document.createElement("div");
        stageDiv.style.cssText = "margin-bottom: 32px; padding: 24px; background: rgba(16, 185, 129, 0.05); border-radius: 16px; border: 1px solid var(--primary); box-shadow: 0 0 30px rgba(16, 185, 129, 0.05);";
        stageDiv.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 0.9rem; color: var(--primary); text-transform: uppercase; letter-spacing: 0.1em;">Current Component</h2>
      <p style="margin: 0 0 20px 0; font-size: 1.5rem; color: var(--text);"><strong>${escapeHtml(currentStage.stageName)}</strong> <span style="color: var(--text-dim); font-size: 1rem; margin-left: 8px;">(${mix.currentStageIndex + 1} of ${stages.length})</span></p>
      
      <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px;">
        <span style="font-size: 0.9rem; color: var(--text-muted);">Remaining</span>
        <span style="font-size: 2.5rem; font-weight: 700; font-family: 'Outfit', sans-serif; letter-spacing: -0.05em;"
          data-end-ms="${stageEnd}"
          data-mix-id="${mix.id}"
          data-stage-index="${mix.currentStageIndex}"
          data-mix-name="${escapeHtml(mix.mixName)}"
          data-stage-name="${escapeHtml(currentStage.stageName)}"
        >${formatTime(remaining)}</span>
      </div>
      
      <p class="status ${remaining === 0 ? 'done' : 'running'}" style="margin: 0;">${remaining === 0 ? "✓ Component complete" : "○ In progress"}</p>
    `;
        mixContent.appendChild(stageDiv);
    }

    // All stages list
    const stagesDiv = document.createElement("div");
    stagesDiv.style.cssText = "margin-bottom: 32px;";
    stagesDiv.innerHTML = "<h3 style='margin-bottom: 16px; font-size: 1.1rem; color: var(--text-muted);'>Timeline</h3>";

    const stagesList = document.createElement("div");
    stagesList.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

    stages.forEach((stage, idx) => {
        const item = document.createElement("div");
        const isCurrent = idx === mix.currentStageIndex;
        item.style.cssText = `
      display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; 
      background: ${isCurrent ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface)'};
      border: 1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'};
      border-radius: 12px; transition: all 0.2s ease;
    `;
        item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 0.8rem; color: ${isCurrent ? 'var(--primary)' : 'var(--text-dim)'}; font-weight: 700; width: 20px;">${idx + 1}</span>
        <strong style="color: ${isCurrent ? 'var(--text)' : 'var(--text-muted)'};">${escapeHtml(stage.stageName)}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 0.9rem; color: var(--text-dim);">${formatTime(stage.durationMs)}</span>
        ${isCurrent ? '<span class="status running" style="font-size: 0.7rem;">Active</span>' : (idx < mix.currentStageIndex ? '<span style="color: var(--ok);">✓</span>' : '')}
      </div>
    `;
        stagesList.appendChild(item);
    });

    stagesDiv.appendChild(stagesList);
    mixContent.appendChild(stagesDiv);

    // Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = "display: flex; gap: 10px; margin-top: 20px;";

    if (mix.currentStageIndex < stages.length - 1) {
        const nextBtn = document.createElement("button");
        nextBtn.className = "btn primary";
        nextBtn.textContent = "Next Component";
        nextBtn.addEventListener("click", async () => {
            try {
                await advanceStage(mixId, mix.currentStageIndex, stages.length);
            } catch (e) {
                console.error(e);
                errorMsg.textContent = "Error advancing stage: " + e.message;
            }
        });
        actionsDiv.appendChild(nextBtn);
    } else {
        const completeMsg = document.createElement("p");
        completeMsg.style.cssText = "color: #28a745; font-weight: bold; margin: 0;";
        completeMsg.textContent = "All components complete!";
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
            const stages = mix.components || mix.powders || [];
            const stage = stages[mix.currentStageIndex];
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
                totalStages: stages.length,
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
            groupDiv.className = "fade-in";
            groupDiv.style.cssText = "border-left: 4px solid " + color + "; padding: 0 0 0 20px; margin-bottom: 40px;";

            const heading = document.createElement("h3");
            heading.style.cssText = "margin-top: 0; margin-bottom: 20px; color: " + color + "; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em;";
            heading.textContent = categoryKey;
            groupDiv.appendChild(heading);

            const mixesContainer = document.createElement("div");
            mixesContainer.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

            items.forEach(mix => {
                const mixItem = document.createElement("div");
                mixItem.setAttribute('data-mix-card', '');
                mixItem.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border); cursor: pointer; transition: all 0.2s ease;";
                mixItem.onmouseover = () => { mixItem.style.borderColor = "var(--border-focus)"; mixItem.style.background = "var(--surface-elevated)"; };
                mixItem.onmouseout = () => { mixItem.style.borderColor = "var(--border)"; mixItem.style.background = "var(--surface)"; };

                const infoDiv = document.createElement("div");
                infoDiv.style.flex = "1";
                infoDiv.onclick = () => window.location.href = "mix.html?id=" + mix.id;

                const title = document.createElement("strong");
                let titleText = escapeHtml(mix.mixName);
                if (mix.batchNumber) titleText = `<span style="color: var(--text-dim); font-weight: 400;">${escapeHtml(mix.batchNumber)}</span> <span style="color: var(--border); margin: 0 4px;">/</span> ` + titleText;
                title.innerHTML = titleText;
                title.style.color = 'var(--text)';
                title.style.fontSize = '1.1rem';
                infoDiv.appendChild(title);

                const details = document.createElement("span");
                details.style.cssText = "display: block; font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;";
                details.innerHTML = `
          <span style="color: var(--primary); font-weight: 600;">${escapeHtml(mix.stageName)}</span> 
          <span style="color: var(--text-dim); margin: 0 8px;">•</span>
          <span>${mix.currentStageIndex + 1}/${mix.totalStages} stages</span>
          <span style="color: var(--text-dim); margin: 0 8px;">•</span>
          <span>${escapeHtml(mix.createdByName)}</span>
          <span style="color: var(--text-dim); margin: 0 8px;">•</span>
          <span
            data-end-ms="${Date.now() + mix.remaining}"
            data-mix-id="${mix.id}"
            data-stage-index="${mix.currentStageIndex}"
            data-mix-name="${escapeHtml(mix.mixName)}"
            data-stage-name="${escapeHtml(mix.stageName)}"
          >${formatTime(mix.remaining)}</span> left
        `;
                infoDiv.appendChild(details);

                const actionsDiv = document.createElement("div");
                actionsDiv.style.cssText = "display: flex; gap: 8px; margin-left: 16px;";

                const nextBtn = document.createElement("button");
                nextBtn.className = "btn small";
                nextBtn.textContent = "Next Stage";
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
                deleteBtn.className = "btn danger small";
                deleteBtn.innerHTML = "×";
                deleteBtn.title = "Delete Mix";
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (currentUser && currentUser.uid === mix.createdByUid) {
                        if (confirm("Delete this mix?")) {
                            try { softDeleteMix(mix.id); }
                            catch (err) { console.error(err); alert(err.message); }
                        }
                    } else {
                        alert("You can only delete mixes you created.");
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
                < p > <strong>${user.displayName || user.email}</strong></p >
                <button id="logoutBtn2">Logout</button>
    `;

        document.getElementById("logoutBtn2").addEventListener("click", async () => {
            await logoutUser();
            window.location.href = "login.html";
        });
    });
}
