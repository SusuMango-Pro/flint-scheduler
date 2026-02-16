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
    const mixColorInput = document.getElementById("mixColor");
    const templateColorInput = document.getElementById("templateColor");

    // Color preset buttons for main mix form
    document.querySelectorAll(".colorPreset")?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const bgColor = window.getComputedStyle(btn).backgroundColor;
        const hex = rgbToHex(bgColor);
        mixColorInput.value = hex;
      });
    });

    // Color preset buttons for template form
    document.querySelectorAll(".templateColorPreset")?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const bgColor = window.getComputedStyle(btn).backgroundColor;
        const hex = rgbToHex(bgColor);
        templateColorInput.value = hex;
      });
    });

    // Initialize with 1 powder stage
    addPowderStageRow(powderStagesList, 1, false);

    // Add powder stage button
    document.getElementById("addPowderStageBtn")?.addEventListener("click", () => {
      stageCounter++;
      addPowderStageRow(powderStagesList, stageCounter, true);
    });

    // Create mix button
    document.getElementById("createMixBtn")?.addEventListener("click", async () => {
      const mixName = document.getElementById("mixName").value.trim();
      const description = document.getElementById("mixDescription").value.trim();
      const category = document.getElementById("mixCategory").value.trim();
      const color = document.getElementById("mixColor").value.trim();

      const powders = [];
      const stageInputs = powderStagesList.querySelectorAll(".stage-row");

      stageInputs.forEach((row, idx) => {
        const stageName = row.querySelector(".stage-name").value.trim();
        const minutes = Number(row.querySelector(".stage-minutes").value);

        if (stageName && minutes > 0) {
          powders.push({
            stageName,
            durationMs: minutes * 60000
          });
        }
      });

      if (!mixName) {
        alert("Enter mix name");
        return;
      }

      if (powders.length === 0) {
        alert("Add at least one stage");
        return;
      }

      try {
        await db.collection("mixes").add({
          createdByUid: user.uid,
          createdByEmail: user.email,
          createdByName: user.displayName || null,
          mixName,
          description: description || null,
          category: category || null,
          color: color || "#666666",
          powders,
          currentStageIndex: 0,
          currentStageStartedAtMs: Date.now(),
          createdAtMs: Date.now(),
          isDeleted: false
        });

        window.location.href = "index.html";
      } catch (e) {
        console.error(e);
        alert(e.message);
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
      const color = document.getElementById("templateColor").value.trim();
      const description = document.getElementById("templateDescription").value.trim();

      const powders = [];
      const templateRows = document.getElementById("templatePowdersList").querySelectorAll(".template-stage-row");

      templateRows.forEach((row) => {
        const stageName = row.querySelector(".template-stage-name").value.trim();
        const minutes = Number(row.querySelector(".template-stage-minutes").value);

        if (stageName && minutes > 0) {
          powders.push({
            stageName,
            durationMs: minutes * 60000
          });
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
        await db.collection("templates").add({
          userId: user.uid,
          templateName,
          category: category || null,
          color: color || "#666666",
          description: description || null,
          powders,
          createdAtMs: Date.now()
        });

        // Reset form
        document.getElementById("templateName").value = "";
        document.getElementById("templateCategory").value = "";
        document.getElementById("templateColor").value = "#666666";
        document.getElementById("templateDescription").value = "";
        document.getElementById("templatePowdersList").innerHTML = "";
        templateStageCounter = 1;
        addTemplatePowderRow(document.getElementById("templatePowdersList"), 1, false);

        document.getElementById("templateMsg").textContent = "Template saved!";
        setTimeout(() => { document.getElementById("templateMsg").textContent = ""; }, 2000);

        // Refresh templates list
        loadAndRenderTemplates(user.uid, templatesList);
      } catch (e) {
        console.error(e);
        document.getElementById("templateMsg").textContent = e.message;
      }
    });

    // Show templates section once user is loaded
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
    removeBtn.addEventListener("click", () => {
      row.remove();
    });
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
    removeBtn.addEventListener("click", () => {
      row.remove();
    });
    row.appendChild(removeBtn);
  }

  container.appendChild(row);
}

function loadAndRenderTemplates(userId, container) {
  db.collection("templates")
    .where("userId", "==", userId)
    .onSnapshot((snapshot) => {
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
          <strong>${template.templateName}</strong>
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
            const newMix = await db.collection("mixes").add({
              createdByUid: user.uid,
              createdByEmail: user.email,
              createdByName: user.displayName || null,
              mixName: template.templateName,
              description: template.description || null,
              category: template.category || null,
              color: template.color || "#666666",
              powders: template.powders,
              currentStageIndex: 0,
              currentStageStartedAtMs: Date.now(),
              createdAtMs: Date.now(),
              isDeleted: false
            });
            window.location.href = "index.html";
          } catch (e) {
            console.error(e);
            alert(e.message);
          }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.style.fontSize = "0.9em";
        deleteBtn.addEventListener("click", async () => {
          if (confirm("Delete this template?")) {
            try {
              await db.collection("templates").doc(doc.id).delete();
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
function initMixDetailPage() {
  const userBadge = document.getElementById("userBadge");
  const mixContent = document.getElementById("mixContent");
  const errorMsg = document.getElementById("errorMsg");

  // Get mix ID from URL
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

    // Load mix from Firestore
    const unsubscribe = db.collection("mixes").doc(mixId).onSnapshot(
      (doc) => {
        if (!doc.exists) {
          errorMsg.textContent = "Mix not found";
          return;
        }

        const mix = { id: doc.id, ...doc.data() };

        if (mix.isDeleted) {
          errorMsg.textContent = "This mix has been deleted";
          return;
        }

        renderMixDetail(mix, user);
      },
      (error) => {
        console.error(error);
        errorMsg.textContent = "Error loading mix: " + error.message;
      }
    );
  });

  function renderMixDetail(mix, user) {
    mixContent.innerHTML = "";
    errorMsg.textContent = "";

    const now = Date.now();
    const currentStage = mix.powders[mix.currentStageIndex];
    const stageEnd = mix.currentStageStartedAtMs + (currentStage?.durationMs || 0);
    const remaining = Math.max(0, stageEnd - now);

    // Header with color
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid " + (mix.color || "#666666");
    header.innerHTML = `
      <h1 style="margin: 0 0 5px 0; color: ${mix.color || '#333'};">${escapeHtml(mix.mixName)}</h1>
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

    // Current stage info
    if (currentStage) {
      const stageDiv = document.createElement("div");
      stageDiv.style.cssText = "margin-bottom: 20px; padding: 15px; background: #e8f4f8; border-radius: 4px; border-left: 4px solid #17a2b8;";
      stageDiv.innerHTML = `
        <h2 style="margin: 0 0 10px 0;">Current Stage</h2>
        <p style="margin: 5px 0;"><strong>${escapeHtml(currentStage.stageName)}</strong> (${mix.currentStageIndex + 1} of ${mix.powders.length})</p>
        <p style="margin: 5px 0; font-size: 1.2em;"><strong>Time remaining:</strong> ${formatTime(remaining)}</p>
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
      const isCurrent = idx === mix.currentStageIndex;
      li.innerHTML = `
        <strong>${escapeHtml(stage.stageName)}</strong> - ${durationMin} min
        ${isCurrent ? '<span style="margin-left: 10px; color: #d39e00; font-weight: bold;">← Current</span>' : ''}
      `;
      stagesList.appendChild(li);
    });

    stagesDiv.appendChild(stagesList);
    mixContent.appendChild(stagesDiv);

    // Action buttons
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = "display: flex; gap: 10px; margin-top: 20px;";

    // Next stage button
    if (mix.currentStageIndex < mix.powders.length - 1) {
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn primary";
      nextBtn.textContent = "Next Stage";
      nextBtn.addEventListener("click", async () => {
        try {
          await db.collection("mixes").doc(mixId).update({
            currentStageIndex: mix.currentStageIndex + 1,
            currentStageStartedAtMs: Date.now()
          });
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

    // Delete button (only if creator)
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
}



function initIndexPage() {
  const userBadge = document.getElementById("userBadge");
  const loginLink = document.getElementById("loginLink");
  const logoutBtn = document.getElementById("logoutBtn");
  const mixRows = document.getElementById("mixRows");
  const teamTabBtn = document.getElementById("teamTabBtn");
  const myTabBtn = document.getElementById("myTabBtn");

  let currentUser = null;
  let currentTab = "team"; // "team" or "my"
  let allMixes = [];
  let unsubscribe = null;

  logoutBtn?.addEventListener("click", async () => {
    await logoutUser();
  });

  // Tab button handlers
  teamTabBtn?.addEventListener("click", () => {
    currentTab = "team";
    updateTabStyle();
    renderMixes();
  });

  myTabBtn?.addEventListener("click", () => {
    currentTab = "my";
    updateTabStyle();
    renderMixes();
  });

  function updateTabStyle() {
    if (currentTab === "team") {
      teamTabBtn.style.borderBottom = "3px solid #007bff";
      teamTabBtn.style.color = "#007bff";
      myTabBtn.style.borderBottom = "3px solid transparent";
      myTabBtn.style.color = "#666";
    } else {
      teamTabBtn.style.borderBottom = "3px solid transparent";
      teamTabBtn.style.color = "#666";
      myTabBtn.style.borderBottom = "3px solid #007bff";
      myTabBtn.style.color = "#007bff";
    }
  }

  auth.onAuthStateChanged((user) => {
    currentUser = user;

    if (user) {
      userBadge.textContent = user.displayName || user.email;
      loginLink.style.display = "none";
      logoutBtn.style.display = "inline-flex";
      teamTabBtn.style.display = "inline-block";
      myTabBtn.style.display = "inline-block";

      // Subscribe to ALL non-deleted mixes, filter in JavaScript
      unsubscribe = db.collection("mixes")
        .where("isDeleted", "==", false)
        .onSnapshot(
          (snapshot) => {
            allMixes = [];
            snapshot.forEach((doc) => {
              allMixes.push({ id: doc.id, ...doc.data() });
            });
            renderMixes();
          },
          (error) => {
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
      mixRows.innerHTML = "<p style='color: #999;'>Please log in to view mixes</p>";

      if (unsubscribe) unsubscribe();
    }
  });

  function renderMixes() {
    // Filter mixes based on current tab
    let mixes = [];
    if (currentTab === "team") {
      // Show mixes from others (not created by current user)
      mixes = allMixes.filter(mix => mix.createdByUid !== currentUser.uid);
    } else {
      // Show only my mixes
      mixes = allMixes.filter(mix => mix.createdByUid === currentUser.uid);
    }

    renderTable(mixes);
  }

  function renderTable(mixes) {
    mixRows.innerHTML = "";

    if (mixes.length === 0) {
      const emptyMsg = currentTab === "team" 
        ? "No mixes from teammates yet"
        : "No mixes created by you yet. Start by adding one!";
      mixRows.innerHTML = `<p style='color: #999;'>${emptyMsg}</p>`;
      return;
    }

    const now = Date.now();

    // Group by color
    const groupedByColor = {};
    
    mixes.forEach((mix) => {
      // Skip deleted mixes
      if (mix.isDeleted) return;

      const stage = mix.powders[mix.currentStageIndex];
      if (!stage) return;

      const end = mix.currentStageStartedAtMs + stage.durationMs;
      const remaining = Math.max(0, end - now);
      
      const color = mix.color || "#666666";
      const groupKey = color;
      
      if (!groupedByColor[groupKey]) {
        groupedByColor[groupKey] = [];
      }
      
      groupedByColor[groupKey].push({
        id: mix.id,
        createdByName: mix.createdByName || mix.createdByEmail || "Unknown",
        mixName: mix.mixName,
        category: mix.category,
        description: mix.description,
        stageName: stage.stageName,
        currentStageIndex: mix.currentStageIndex,
        totalStages: mix.powders.length,
        remaining,
        isDone: remaining === 0,
        createdByUid: mix.createdByUid,
        color: mix.color
      });
    });

    // Sort each group by time remaining (ascending)
    Object.keys(groupedByColor).forEach(color => {
      groupedByColor[color].sort((a, b) => a.remaining - b.remaining);
    });

    // Render groups
    Object.keys(groupedByColor).sort().forEach(color => {
      const groupDiv = document.createElement("div");
      groupDiv.style.cssText = "border-left: 5px solid " + color + "; padding: 15px; background: #fafafa; border-radius: 4px;";

      const heading = document.createElement("h3");
      heading.style.cssText = "margin-top: 0; margin-bottom: 15px; color: " + color + ";";
      heading.textContent = "Color: " + color;
      groupDiv.appendChild(heading);

      const mixesContainer = document.createElement("div");
      mixesContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

      groupedByColor[color].forEach(mix => {
        const mixItem = document.createElement("div");
        mixItem.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 4px; border: 1px solid #ddd; cursor: pointer; transition: background-color 0.2s;";
        mixItem.onmouseover = () => mixItem.style.backgroundColor = "#f9f9f9";
        mixItem.onmouseout = () => mixItem.style.backgroundColor = "white";

        const infoDiv = document.createElement("div");
        infoDiv.style.flex = "1";
        infoDiv.style.cursor = "pointer";
        infoDiv.onclick = () => window.location.href = "mix.html?id=" + mix.id;
        
        const title = document.createElement("strong");
        title.textContent = escapeHtml(mix.mixName);
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
          <strong>Time left:</strong> ${formatTime(mix.remaining)} | 
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
          if (currentUser && (currentUser.uid === mix.createdByUid)) {
            if (confirm("Delete this mix?")) {
              try {
                softDeleteMix(mix.id);
              } catch (err) {
                console.error(err);
                alert("Error deleting mix: " + err.message);
              }
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


// ===== FIRESTORE =====
// Note: Two-dashboard filtering is now handled in initIndexPage


async function softDeleteMix(mixId) {
  try {
    await db.collection("mixes").doc(mixId).update({
      isDeleted: true
    });
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}


// ===== NEXT STAGE =====
async function nextStage(id, currentIndex, total) {
  if (currentIndex >= total - 1) return;

  await db.collection("mixes").doc(id).update({
    currentStageIndex: currentIndex + 1,
    currentStageStartedAtMs: Date.now()
  });
}


// ===== TEMPLATES =====
async function saveAsTemplate(mixId, templateName) {
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
      powders: mixData.powders,
      createdAtMs: Date.now()
    });

    alert("Template saved!");
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

async function createMixFromTemplate(templateId) {
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
      powders: templateData.powders,
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

async function deleteTemplate(templateId) {
  try {
    await db.collection("templates").doc(templateId).delete();
    alert("Template deleted");
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
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

function rgbToHex(rgb) {
  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return "#666666";
  
  const r = parseInt(match[0]);
  const g = parseInt(match[1]);
  const b = parseInt(match[2]);
  
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("").toUpperCase();
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
