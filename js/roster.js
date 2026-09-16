// roster.js — logic for roster.html only

let appState = requireState();

// page-local UI state (not persisted)
let ui = {
  form: { name: "", gender: "M", category: "Beginner" },
  search: "",
  sortMode: "name-asc", // name-asc | name-desc | games-asc
  editingId: null,
  editDraft: null,
  importOpen: false,
  importText: "",
  exportOpen: false,
  testCount: 8,
};

function persist() {
  saveState(appState);
}

// ---------- derived ----------

function sortedFilteredPlayers() {
  let list = appState.players.filter((p) =>
    p.name.toLowerCase().includes(ui.search.toLowerCase()),
  );
  if (ui.sortMode === "name-asc")
    list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (ui.sortMode === "name-desc")
    list = list.slice().sort((a, b) => b.name.localeCompare(a.name));
  if (ui.sortMode === "games-asc")
    list = list.slice().sort((a, b) => a.gamesPlayed - b.gamesPlayed);
  return list;
}

const SORT_LABELS = {
  "name-asc": "Name \u25B2 A-Z",
  "name-desc": "Name \u25BC Z-A",
  "games-asc": "Games \u25B2 Fewest",
};
const SORT_CYCLE = {
  "name-asc": "name-desc",
  "name-desc": "games-asc",
  "games-asc": "name-asc",
};

// ---------- actions ----------

function addPlayer() {
  if (!ui.form.name.trim()) return;
  appState.players.push({
    id: appState.nextPlayerId++,
    name: ui.form.name.trim(),
    gender: ui.form.gender,
    category: ui.form.category,
    partnerId: null,
    queued: false,
    queuedSince: null,
    resting: false,
    pairNextWith: null,
    partnerHistory: [],
    opponentHistory: [],
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
  });
  ui.form.name = "";
  persist();
  render();
}

function removePlayer(id) {
  appState.players.forEach((p) => {
    if (p.partnerId === id) p.partnerId = null;
  });
  appState.players = appState.players.filter((p) => p.id !== id);
  persist();
  render();
}

function startEdit(id) {
  const p = playerById(appState.players, id);
  if (!p) return;
  ui.editingId = id;
  ui.editDraft = { name: p.name, gender: p.gender, category: p.category };
  render();
}

function saveEdit(id) {
  const p = playerById(appState.players, id);
  if (!p || !ui.editDraft.name.trim()) return;
  p.name = ui.editDraft.name.trim();
  p.gender = ui.editDraft.gender;
  p.category = ui.editDraft.category;
  ui.editingId = null;
  ui.editDraft = null;
  persist();
  render();
}

function cancelEdit() {
  ui.editingId = null;
  ui.editDraft = null;
  render();
}

function toggleQueued(id) {
  const p = playerById(appState.players, id);
  if (p) {
    p.queued = !p.queued;
    p.queuedSince = p.queued ? Date.now() : null;
  }
  persist();
  render();
}

function setPartner(playerId, newPartnerIdStr) {
  const newPartnerId = newPartnerIdStr ? Number(newPartnerIdStr) : null;
  const player = playerById(appState.players, playerId);
  if (!player) return;
  appState.players.forEach((p) => {
    if (p.id !== playerId && p.partnerId === playerId && p.id !== newPartnerId)
      p.partnerId = null;
  });
  player.partnerId = newPartnerId;
  if (newPartnerId) {
    const np = playerById(appState.players, newPartnerId);
    if (np) np.partnerId = playerId;
  }
  persist();
  render();
}

function queueAll() {
  appState.players.forEach((p) => {
    p.queued = true;
    p.queuedSince = Date.now();
  });
  persist();
  render();
}
function uncheckAll() {
  appState.players.forEach((p) => {
    p.queued = false;
    p.queuedSince = null;
  });
  persist();
  render();
}
function clearRoster() {
  if (
    !confirm(
      "Remove every player from the roster? Courts and stats are untouched.",
    )
  )
    return;
  appState.players.forEach((p) => {
    p.partnerId = null;
  });
  appState.players = [];
  persist();
  render();
}

function runImport() {
  const rows = ui.importText
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  rows.forEach((row) => {
    const parts = row.split(",").map((s) => (s || "").trim());
    const name = parts[0];
    if (!name) return;
    const genderRaw = parts[1] || "M";
    const categoryRaw = parts[2] || "";
    const gender = genderRaw.toUpperCase().startsWith("F") ? "F" : "M";
    const category = CATEGORIES.includes(categoryRaw)
      ? categoryRaw
      : "Beginner";
    appState.players.push({
      id: appState.nextPlayerId++,
      name,
      gender,
      category,
      partnerId: null,
      queued: false,
      queuedSince: null,
      resting: false,
      pairNextWith: null,
      partnerHistory: [],
      opponentHistory: [],
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
    });
  });
  ui.importText = "";
  ui.importOpen = false;
  persist();
  render();
}

function addTestPlayers(count) {
  const firstNames = [
    "Alex",
    "Bea",
    "Chris",
    "Dana",
    "Eli",
    "Faye",
    "Gino",
    "Hana",
    "Ivan",
    "Jules",
    "Kai",
    "Lena",
  ];
  const n = Math.max(1, Math.min(50, count || 8));
  for (let i = 0; i < n; i++) {
    const name = `${firstNames[i % firstNames.length]}${Math.floor(i / firstNames.length) || ""}`;
    appState.players.push({
      id: appState.nextPlayerId++,
      name,
      gender: i % 2 === 0 ? "M" : "F",
      category: CATEGORIES[i % CATEGORIES.length],
      partnerId: null,
      queued: false,
      queuedSince: null,
      resting: false,
      pairNextWith: null,
      partnerHistory: [],
      opponentHistory: [],
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
    });
  }
  persist();
  render();
}

// ---------- render ----------
// (categoryBadge lives in state.js now - shared with queue.js)

function renderHeader() {
  const queuedCount = appState.players.filter((p) => p.queued).length;
  return `
  <div class="header">
    <div class="stripe"></div>
    <h1>Crankminton</h1>
    <span class="ver">v1.0</span>
    <span class="meta">${appState.players.length} on roster &middot; ${queuedCount} queued</span>
  </div>`;
}

function renderNav() {
  return `
  <div class="nav">
    <a href="roster.html" class="active">Roster</a>
    <a href="queue.html">Queue</a>
    <a href="stats.html">Game Stats</a>
    <a href="tournament.html">Tournament</a>
  </div>`;
}

function renderToolbar() {
  const genderOptions = ["M", "F"]
    .map(
      (g) =>
        `<option value="${g}" ${ui.form.gender === g ? "selected" : ""}>${g === "M" ? "Male" : "Female"}</option>`,
    )
    .join("");
  const categoryOptions = CATEGORIES.map(
    (c) =>
      `<option value="${c}" ${ui.form.category === c ? "selected" : ""}>${c}</option>`,
  ).join("");
  return `
  <div class="panel">
    <div class="roster-toolbar">
      <input type="text" data-field="form-name" placeholder="New Player..." value="${esc(ui.form.name)}" />
      <select data-field="form-gender">${genderOptions}</select>
      <select data-field="form-category">${categoryOptions}</select>
      <button class="btn amber" data-action="add-player">Add</button>
    </div>

    ${
      ui.importOpen
        ? `<div class="import-export-panel">
           <textarea data-field="import-text" placeholder="One per line:&#10;Juan Dela Cruz, M, Advance">${esc(ui.importText)}</textarea>
           <div style="display:flex;gap:8px;">
             <button class="btn green small" data-action="run-import">Import</button>
             <button class="btn outline small" data-action="cancel-import">Cancel</button>
           </div>
         </div>`
        : ui.exportOpen
          ? `<div class="import-export-panel">
           <textarea readonly>${esc(appState.players.map((p) => `${p.name},${p.gender},${p.category}`).join("\n"))}</textarea>
           <button class="btn outline small" data-action="close-export">Close</button>
         </div>`
          : `<div class="import-export-row">
           <button class="btn blue" data-action="open-import">Roster Import</button>
           <button class="btn blue" data-action="open-export" ${appState.players.length === 0 ? "disabled" : ""}>Export Roster</button>
         </div>`
    }

    <div class="search-sort-row">
      <div class="search-wrap">
        <span class="search-icon">&#128269;</span>
        <input type="text" data-field="roster-search" placeholder="Search players..." value="${esc(ui.search)}" />
      </div>
      <button class="btn outline" data-action="cycle-sort">${SORT_LABELS[ui.sortMode]}</button>
    </div>
  </div>`;
}

function renderPlayerRow(p) {
  const partnerOptions = appState.players
    .filter((q) => q.id !== p.id && (!q.partnerId || q.partnerId === p.id))
    .map(
      (q) =>
        `<option value="${q.id}" ${p.partnerId === q.id ? "selected" : ""}>${esc(playerOptionLabel(q))}</option>`,
    )
    .join("");

  if (ui.editingId === p.id) {
    return `
    <div class="player-row">
      <div class="player-edit-row">
        <input type="text" data-field="edit-name" value="${esc(ui.editDraft.name)}" />
        <select data-field="edit-gender">
          <option value="M" ${ui.editDraft.gender === "M" ? "selected" : ""}>Male</option>
          <option value="F" ${ui.editDraft.gender === "F" ? "selected" : ""}>Female</option>
        </select>
        <select data-field="edit-category">
          ${CATEGORIES.map((c) => `<option value="${c}" ${ui.editDraft.category === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
        <button class="btn green small" data-action="save-edit" data-id="${p.id}">Save</button>
        <button class="btn outline small" data-action="cancel-edit">Cancel</button>
      </div>
    </div>`;
  }

  return `
  <div class="player-row">
    <div class="player-row-top">
      <span class="name">${esc(p.name)}</span>
      <span class="gender-badge ${p.gender}">${p.gender}</span>
      ${categoryBadge(p.category)}
      <span style="margin-left:auto;display:flex;gap:6px;">
        <button class="icon-btn edit" data-action="start-edit" data-id="${p.id}" title="Edit">&#9998;</button>
        <button class="icon-btn del" data-action="remove-player" data-id="${p.id}" title="Remove">&#10005;</button>
      </span>
    </div>
    <div class="player-row-bottom">
      &#128279;
      <select data-action="set-partner" data-id="${p.id}">
        <option value="">&mdash; No Partner &mdash;</option>
        ${partnerOptions}
      </select>
      <span style="font-size:12px;color:var(--ink-soft)">${p.gamesPlayed}g &middot; ${p.wins}W-${p.losses}L</span>
      <label class="queue-toggle">
        <input type="checkbox" data-action="toggle-queued" data-id="${p.id}" ${p.queued ? "checked" : ""} />
        Queue
      </label>
    </div>
  </div>`;
}

function renderList() {
  const list = sortedFilteredPlayers();
  const body =
    list.length === 0
      ? `<div class="empty-note">${appState.players.length === 0 ? "No players yet. Add one above." : "No players match that search."}</div>`
      : list.map(renderPlayerRow).join("");

  return `
  <div class="panel">
    <div class="bulk-actions">
      <button class="btn amber small" data-action="queue-all" ${appState.players.length === 0 ? "disabled" : ""}>&#10003; Queue All</button>
      <button class="btn gray small" data-action="uncheck-all" ${appState.players.length === 0 ? "disabled" : ""}>Uncheck All</button>
      <button class="btn red small" data-action="clear-roster" ${appState.players.length === 0 ? "disabled" : ""}>&#128465; Clear All</button>
    </div>
    ${body}
    <div class="test-players-row">
      <input type="number" data-field="test-count" min="1" max="50" value="${ui.testCount}" />
      <button class="btn outline small" data-action="add-test-players">Add Test Players</button>
    </div>
  </div>`;
}

function render() {
  const active = document.activeElement;
  const activeField = active && active.dataset ? active.dataset.field : null;
  const selStart =
    active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd =
    active && "selectionEnd" in active ? active.selectionEnd : null;

  document.getElementById("app").innerHTML =
    `${renderHeader()}${renderNav()}${renderToolbar()}${renderList()}`;

  if (activeField) {
    const el = document.querySelector(`[data-field="${activeField}"]`);
    if (el) {
      el.focus();
      if (selStart !== null && el.setSelectionRange) {
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch (e) {
          /* not applicable */
        }
      }
    }
  }
}

// ---------- event delegation ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  if (el.tagName === "INPUT" && el.type === "checkbox") return; // handled on change
  const id = el.dataset.id ? Number(el.dataset.id) : null;

  switch (el.dataset.action) {
    case "add-player":
      addPlayer();
      break;
    case "remove-player":
      removePlayer(id);
      break;
    case "start-edit":
      startEdit(id);
      break;
    case "save-edit":
      saveEdit(id);
      break;
    case "cancel-edit":
      cancelEdit();
      break;
    case "queue-all":
      queueAll();
      break;
    case "uncheck-all":
      uncheckAll();
      break;
    case "clear-roster":
      clearRoster();
      break;
    case "open-import":
      ui.importOpen = true;
      render();
      break;
    case "cancel-import":
      ui.importOpen = false;
      ui.importText = "";
      render();
      break;
    case "run-import":
      runImport();
      break;
    case "open-export":
      ui.exportOpen = true;
      render();
      break;
    case "close-export":
      ui.exportOpen = false;
      render();
      break;
    case "cycle-sort":
      ui.sortMode = SORT_CYCLE[ui.sortMode];
      render();
      break;
    case "add-test-players":
      addTestPlayers(ui.testCount);
      break;
    default:
      break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;

  if (el.dataset.action === "toggle-queued") {
    toggleQueued(Number(el.dataset.id));
    return;
  }
  if (el.dataset.action === "set-partner") {
    setPartner(Number(el.dataset.id), el.value);
    return;
  }

  switch (el.dataset.field) {
    case "form-gender":
      ui.form.gender = el.value;
      render();
      return;
    case "form-category":
      ui.form.category = el.value;
      render();
      return;
    case "edit-gender":
      ui.editDraft.gender = el.value;
      render();
      return;
    case "edit-category":
      ui.editDraft.category = el.value;
      render();
      return;
    case "test-count":
      ui.testCount = Number(el.value) || 8;
      return;
    default:
      return;
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  switch (el.dataset.field) {
    case "form-name":
      ui.form.name = el.value;
      render();
      break;
    case "roster-search":
      ui.search = el.value;
      render();
      break;
    case "import-text":
      ui.importText = el.value;
      render();
      break;
    case "edit-name":
      ui.editDraft.name = el.value;
      render();
      break;
    default:
      break;
  }
});

render();