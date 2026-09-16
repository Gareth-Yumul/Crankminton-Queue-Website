// tournament.js — logic for tournament.html only (Phase 1: setup + team pairing)

let appState = requireState();

let ui = {
  view: "list", // "list" | "create" | "setup"
  activeTournamentId: null,
  createForm: {
    name: "",
    categoryMode: "within",
    pairMode: "shuffle",
    participantIds: [],
    customMerges: { advUpper: false, upperLower: false, lowerBeg: false },
  },
  createSearch: "",
  editingTeamId: null,
  customDraft: {
    groupLabel: "",
    slotA: "",
    slotB: "",
    filterA: "any",
    filterB: "any",
  },
};

function persist() {
  saveState(appState);
}

function activeTournament() {
  return (
    appState.tournaments.find((t) => t.id === ui.activeTournamentId) || null
  );
}

// ---------- actions: list / create ----------

function goToList() {
  ui.view = "list";
  ui.activeTournamentId = null;
  render();
}

function startCreate() {
  ui.view = "create";
  ui.createForm = {
    name: "",
    categoryMode: "within",
    pairMode: "shuffle",
    participantIds: [],
    customMerges: { advUpper: false, upperLower: false, lowerBeg: false },
  };
  ui.createSearch = "";
  render();
}

function toggleParticipant(id) {
  const i = ui.createForm.participantIds.indexOf(id);
  if (i === -1) ui.createForm.participantIds.push(id);
  else ui.createForm.participantIds.splice(i, 1);
  render();
}

function createTournament() {
  const f = ui.createForm;
  if (!f.name.trim()) {
    alert("Give the tournament a name first.");
    return;
  }
  if (f.participantIds.length < 2) {
    alert("Select at least 2 participants.");
    return;
  }
  const t = {
    id: appState.nextTournamentId++,
    name: f.name.trim(),
    status: "setup", // setup | ready
    categoryMode: f.categoryMode, // within | combined | custom - only meaningful for shuffle
    customMerges: { ...f.customMerges },
    pairMode: f.pairMode, // shuffle | custom
    participantIds: f.participantIds.slice(),
    groups: [],
    teams: [],
    unpaired: [],
    nextEntityId: 1,
  };
  appState.tournaments.push(t);
  persist();
  ui.view = "setup";
  ui.activeTournamentId = t.id;
  render();
}

function deleteTournament(id) {
  if (!confirm("Delete this tournament? This can't be undone.")) return;
  appState.tournaments = appState.tournaments.filter((t) => t.id !== id);
  persist();
  goToList();
}

function openTournament(id) {
  ui.view = "setup";
  ui.activeTournamentId = id;
  ui.editingTeamId = null;
  render();
}

// ---------- actions: team setup ----------

function runShuffle() {
  const t = activeTournament();
  if (!t) return;
  if (
    t.teams.length > 0 &&
    !confirm("Re-shuffling discards the current team arrangement. Continue?")
  )
    return;
  const ref = { value: t.nextEntityId };
  const result = generateTournamentTeams(
    appState,
    t.participantIds,
    t.categoryMode,
    ref,
    t.customMerges,
  );
  t.nextEntityId = ref.value;
  t.groups = result.groups;
  t.teams = result.teams;
  t.unpaired = result.unpaired;
  persist();
  render();
}

function teamsUsedIds(t) {
  const used = new Set();
  t.teams.forEach((team) => team.players.forEach((id) => used.add(id)));
  return used;
}

function unassignedParticipants(t) {
  const used = teamsUsedIds(t);
  return t.participantIds
    .map((id) => playerById(appState.players, id))
    .filter((p) => p && !used.has(p.id));
}

function addCustomTeam() {
  const t = activeTournament();
  if (!t) return;
  const { groupLabel, slotA, slotB } = ui.customDraft;
  if (!slotA || !slotB) {
    alert("Pick two players first.");
    return;
  }
  if (slotA === slotB) {
    alert("A team needs two different players.");
    return;
  }
  const label = groupLabel.trim() || "Custom Group";
  const team = {
    id: t.nextEntityId++,
    players: [Number(slotA), Number(slotB)],
  };
  t.teams.push(team);
  let group = t.groups.find((g) => g.label === label);
  if (!group) {
    group = { id: t.nextEntityId++, label, teamIds: [] };
    t.groups.push(group);
  }
  group.teamIds.push(team.id);
  ui.customDraft = {
    groupLabel: label,
    slotA: "",
    slotB: "",
    filterA: ui.customDraft.filterA,
    filterB: ui.customDraft.filterB,
  };
  persist();
  render();
}

function removeTeam(teamId) {
  const t = activeTournament();
  if (!t) return;
  t.teams = t.teams.filter((team) => team.id !== teamId);
  t.groups.forEach((g) => {
    g.teamIds = g.teamIds.filter((id) => id !== teamId);
  });
  t.groups = t.groups.filter((g) => g.teamIds.length > 0);
  if (ui.editingTeamId === teamId) ui.editingTeamId = null;
  persist();
  render();
}

function toggleEditTeam(teamId) {
  ui.editingTeamId = ui.editingTeamId === teamId ? null : teamId;
  render();
}

function editTeamSlot(teamId, index, newIdStr) {
  const t = activeTournament();
  if (!t) return;
  const team = t.teams.find((tm) => tm.id === teamId);
  if (!team) return;
  team.players[index] = Number(newIdStr);
  persist();
  render();
}

function finalizeTeams() {
  const t = activeTournament();
  if (!t) return;
  const unassigned = unassignedParticipants(t);
  if (unassigned.length > 0) {
    const names = unassigned.map((p) => p.name).join(", ");
    if (
      !confirm(
        `${names} ${unassigned.length === 1 ? "isn't" : "aren't"} on a team yet and will sit out until you fix that. Finalize anyway?`,
      )
    )
      return;
  }
  if (t.teams.length < 2) {
    alert("Need at least 2 teams to finalize.");
    return;
  }
  t.status = "ready";
  persist();
  render();
}

function reopenSetup() {
  const t = activeTournament();
  if (!t) return;
  t.status = "setup";
  persist();
  render();
}

// ---------- render ----------

function renderHeader() {
  const busy = getAllBusyIds(appState);
  const waiting = appState.players.filter((p) => p.queued && !busy.has(p.id));
  const inPlay = appState.courts.filter((c) => c.status === "inplay").length;
  return `
  <div class="header">
    <div class="stripe"></div>
    <h1>Crankminton</h1>
    <span class="ver">v1.0</span>
    <span class="meta">${appState.players.length} on roster &middot; ${waiting.length} waiting &middot; ${inPlay}/${appState.courts.length} courts in play</span>
  </div>`;
}

function renderNav() {
  return `
  <div class="nav">
    <a href="roster.html">Roster</a>
    <a href="queue.html">Queue</a>
    <a href="stats.html">Game Stats</a>
    <a href="tournament.html" class="active">Tournament</a>
  </div>`;
}

function renderList() {
  const rows =
    appState.tournaments.length === 0
      ? `<div class="empty-note">No tournaments yet. Create one to get started.</div>`
      : appState.tournaments
          .map(
            (t) => `
      <div class="player-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="name">${esc(t.name)}</div>
        <span class="badge" style="background:var(--panel-alt);color:${t.status === "ready" ? "var(--green)" : "var(--ink-soft)"}">${t.status === "ready" ? "Teams finalized" : "Setting up"}</span>
        <span style="font-size:12px;color:var(--ink-soft)">${t.participantIds.length} players &middot; ${t.teams.length} teams &middot; ${t.pairMode === "shuffle" ? "Shuffled" : "Custom pairing"}</span>
        <span style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn amber small" data-action="open-tournament" data-id="${t.id}">Open</button>
          <button class="btn red small" data-action="delete-tournament" data-id="${t.id}">Delete</button>
        </span>
      </div>`,
          )
          .join("");

  return `
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">Tournaments</div>
      <button class="btn amber small" data-action="start-create">+ New Tournament</button>
    </div>
    ${rows}
  </div>`;
}

function renderCreate() {
  const f = ui.createForm;
  const filtered = appState.players.filter((p) =>
    p.name.toLowerCase().includes(ui.createSearch.toLowerCase()),
  );

  const rows =
    filtered.length === 0
      ? `<div class="empty-note">${appState.players.length === 0 ? "No players on the roster yet - add some on the Roster page first." : "No players match that search."}</div>`
      : filtered
          .map(
            (p) => `
      <label class="player-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;">
        <input type="checkbox" data-action="toggle-participant" data-id="${p.id}" ${f.participantIds.includes(p.id) ? "checked" : ""} />
        <span class="name">${esc(p.name)}</span>
        ${genderBadge(p.gender)} ${categoryBadge(p.category)}
      </label>`,
          )
          .join("");

  return `
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">New Tournament</div>
      <button class="btn outline small" data-action="go-to-list">Cancel</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;max-width:420px;margin-bottom:16px;">
      <input type="text" data-field="tourney-name" placeholder="Tournament name" value="${esc(f.name)}" />

      <div>
        <div class="filter-label">Shuffle grouping</div>
        <div class="chip-row">
          <button class="chip ${f.categoryMode === "within" ? "active" : ""}" data-action="set-category-mode" data-value="within">Within category</button>
          <button class="chip ${f.categoryMode === "combined" ? "active" : ""}" data-action="set-category-mode" data-value="combined">Combined</button>
          <button class="chip ${f.categoryMode === "custom" ? "active" : ""}" data-action="set-category-mode" data-value="custom">Custom</button>
        </div>
        ${
          f.categoryMode === "custom"
            ? `
          <div style="font-size:11px;color:var(--ink-soft);margin:4px 0 6px;">Merge adjacent tiers into one shuffle pool. Unmerged tiers stay separate.</div>
          <div class="chip-row">
            <button class="chip ${f.customMerges.advUpper ? "active" : ""}" data-action="toggle-merge" data-value="advUpper">Merge Adv + Upper</button>
            <button class="chip ${f.customMerges.upperLower ? "active" : ""}" data-action="toggle-merge" data-value="upperLower">Merge Upper + Lower</button>
            <button class="chip ${f.customMerges.lowerBeg ? "active" : ""}" data-action="toggle-merge" data-value="lowerBeg">Merge Lower + Beg</button>
          </div>`
            : ""
        }
      </div>

      <div>
        <div class="filter-label">Pairing method</div>
        <div class="chip-row">
          <button class="chip ${f.pairMode === "shuffle" ? "active" : ""}" data-action="set-pair-mode" data-value="shuffle">Random shuffle</button>
          <button class="chip ${f.pairMode === "custom" ? "active" : ""}" data-action="set-pair-mode" data-value="custom">Custom pairing (e.g. couples)</button>
        </div>
      </div>
    </div>

    <div class="panel-head"><div class="panel-title">Select participants (${f.participantIds.length})</div></div>
    <div class="search-wrap" style="margin-bottom:10px;">
      <span class="search-icon">&#128269;</span>
      <input type="text" data-field="tourney-search" placeholder="Search players..." value="${esc(ui.createSearch)}" />
    </div>
    <div style="max-height:340px;overflow-y:auto;margin-bottom:14px;">${rows}</div>

    <button class="btn amber" data-action="create-tournament">Create Tournament</button>
  </div>`;
}

function optionsForSlot(t, currentId) {
  const used = teamsUsedIds(t);
  let pool = t.participantIds
    .map((id) => playerById(appState.players, id))
    .filter((p) => p && !used.has(p.id));
  const current = playerById(appState.players, currentId);
  if (current && !pool.some((p) => p.id === current.id))
    pool = [...pool, current];
  return pool;
}

function renderTeamCard(t, team) {
  const editing = ui.editingTeamId === team.id;
  const rows = team.players
    .map((id, i) => {
      const p = playerById(appState.players, id);
      if (!p) return "";
      if (editing) {
        const opts = optionsForSlot(t, id)
          .map(
            (o) =>
              `<option value="${o.id}" ${o.id === id ? "selected" : ""}>${esc(playerOptionLabel(o))}</option>`,
          )
          .join("");
        return `<select data-action="edit-team-slot" data-team="${team.id}" data-index="${i}" style="margin-bottom:4px;">${opts}</select>`;
      }
      return `<div class="player-line">${genderBadge(p.gender)} ${esc(p.name)} ${categoryBadge(p.category)}</div>`;
    })
    .join("");

  return `
  <div class="team-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div class="label">Team</div>
      <div style="display:flex;gap:6px;">
        <button class="edit-toggle" data-action="toggle-edit-team" data-id="${team.id}">${editing ? "Done" : "\u270E Edit"}</button>
        ${t.status === "setup" ? `<button class="edit-toggle" style="color:var(--red)" data-action="remove-team" data-id="${team.id}">&#10005;</button>` : ""}
      </div>
    </div>
    ${rows}
  </div>`;
}

function renderSetup() {
  const t = activeTournament();
  if (!t) return `<div class="empty-note">Tournament not found.</div>`;

  const groupsHtml = t.groups
    .map(
      (g) => `
    <div style="margin-bottom:16px;">
      <div class="panel-sub" style="margin-bottom:8px;">${esc(g.label)}</div>
      <div class="chip-row" style="align-items:stretch;">
        ${g.teamIds
          .map((id) =>
            renderTeamCard(
              t,
              t.teams.find((tm) => tm.id === id),
            ),
          )
          .join("")}
      </div>
    </div>`,
    )
    .join("");

  const unassigned = unassignedParticipants(t);
  const unassignedHtml =
    unassigned.length > 0
      ? `<div class="empty-note" style="border-color:var(--amber);color:var(--amber);text-align:left;margin-bottom:14px;">
         Not yet on a team: ${unassigned.map((p) => esc(p.name)).join(", ")}
       </div>`
      : "";

  let setupControls = "";
  if (t.status === "setup") {
    if (t.pairMode === "shuffle") {
      setupControls = `
        <div class="court-actions" style="margin-bottom:14px;">
          <button class="btn green" data-action="run-shuffle">&#128256; ${t.teams.length ? "Re-shuffle" : "Shuffle"}</button>
        </div>`;
    } else {
      const avail = appState.players.filter(
        (p) => t.participantIds.includes(p.id) && !teamsUsedIds(t).has(p.id),
      );
      const catOptions = (current) =>
        `<option value="any" ${current === "any" ? "selected" : ""}>Any</option>` +
        CATEGORIES.map(
          (c) =>
            `<option value="${c}" ${current === c ? "selected" : ""}>${CATEGORY_SHORT[c]}</option>`,
        ).join("");
      const availA =
        ui.customDraft.filterA === "any"
          ? avail
          : avail.filter((p) => p.category === ui.customDraft.filterA);
      const availB =
        ui.customDraft.filterB === "any"
          ? avail
          : avail.filter((p) => p.category === ui.customDraft.filterB);
      const optA = availA
        .map(
          (p) =>
            `<option value="${p.id}" ${ui.customDraft.slotA === String(p.id) ? "selected" : ""}>${esc(playerOptionLabel(p))}</option>`,
        )
        .join("");
      const optB = availB
        .map(
          (p) =>
            `<option value="${p.id}" ${ui.customDraft.slotB === String(p.id) ? "selected" : ""}>${esc(playerOptionLabel(p))}</option>`,
        )
        .join("");
      setupControls = `
        <div class="panel" style="margin-bottom:14px;">
          <div class="filter-label">Add a team</div>
          <input type="text" data-field="group-label" placeholder="Group name (e.g. Couples)" value="${esc(ui.customDraft.groupLabel)}" style="margin-bottom:8px;" />
          <div class="custom-team-row">
            <div class="manual-slot-row">
              <select data-field="filter-a" class="manual-slot-filter">${catOptions(ui.customDraft.filterA)}</select>
              <select data-field="slot-a"><option value="">Player 1</option>${optA}</select>
            </div>
            <div class="manual-slot-row">
              <select data-field="filter-b" class="manual-slot-filter">${catOptions(ui.customDraft.filterB)}</select>
              <select data-field="slot-b"><option value="">Player 2</option>${optB}</select>
            </div>
            <button class="btn green small" data-action="add-custom-team">+ Add Team</button>
          </div>
        </div>`;
    }
  }

  const finalizeRow =
    t.status === "setup"
      ? `<button class="btn amber" data-action="finalize-teams">Finalize Teams</button>`
      : `<div style="display:flex;align-items:center;gap:10px;">
         <span class="badge" style="background:var(--panel-alt);color:var(--green)">Teams finalized</span>
         <button class="btn outline small" data-action="reopen-setup">Re-open setup</button>
         <span style="font-size:12px;color:var(--ink-soft)">Round-robin scheduling is next - not built yet.</span>
       </div>`;

  return `
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">${esc(t.name)}</div>
      <button class="btn outline small" data-action="go-to-list">&larr; All Tournaments</button>
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin-bottom:14px;">
      ${t.participantIds.length} participants &middot; ${t.categoryMode === "within" ? "Within-category" : t.categoryMode === "custom" ? "Custom-merged" : "Combined"} shuffle &middot; ${t.pairMode === "shuffle" ? "Random shuffle" : "Custom pairing"}
    </div>

    ${setupControls}
    ${unassignedHtml}
    ${t.teams.length === 0 ? `<div class="empty-note">No teams yet.</div>` : groupsHtml}

    <div style="margin-top:10px;">${finalizeRow}</div>
  </div>`;
}

function render() {
  const active = document.activeElement;
  const activeField = active && active.dataset ? active.dataset.field : null;
  const selStart =
    active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd =
    active && "selectionEnd" in active ? active.selectionEnd : null;

  let body = "";
  if (ui.view === "list") body = renderList();
  else if (ui.view === "create") body = renderCreate();
  else if (ui.view === "setup") body = renderSetup();

  document.getElementById("app").innerHTML =
    `${renderHeader()}${renderNav()}${body}`;

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
    case "go-to-list":
      goToList();
      break;
    case "start-create":
      startCreate();
      break;
    case "create-tournament":
      createTournament();
      break;
    case "open-tournament":
      openTournament(id);
      break;
    case "delete-tournament":
      deleteTournament(id);
      break;
    case "set-category-mode":
      ui.createForm.categoryMode = el.dataset.value;
      render();
      break;
    case "toggle-merge":
      ui.createForm.customMerges[el.dataset.value] =
        !ui.createForm.customMerges[el.dataset.value];
      render();
      break;
    case "set-pair-mode":
      ui.createForm.pairMode = el.dataset.value;
      render();
      break;
    case "run-shuffle":
      runShuffle();
      break;
    case "add-custom-team":
      addCustomTeam();
      break;
    case "remove-team":
      removeTeam(id);
      break;
    case "toggle-edit-team":
      toggleEditTeam(id);
      break;
    case "finalize-teams":
      finalizeTeams();
      break;
    case "reopen-setup":
      reopenSetup();
      break;
    default:
      break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.action === "toggle-participant") {
    toggleParticipant(Number(el.dataset.id));
    return;
  }
  if (el.dataset.action === "edit-team-slot") {
    editTeamSlot(Number(el.dataset.team), Number(el.dataset.index), el.value);
    return;
  }
  switch (el.dataset.field) {
    case "slot-a":
      ui.customDraft.slotA = el.value;
      render();
      return;
    case "slot-b":
      ui.customDraft.slotB = el.value;
      render();
      return;
    case "filter-a":
      ui.customDraft.filterA = el.value;
      ui.customDraft.slotA = "";
      render();
      return;
    case "filter-b":
      ui.customDraft.filterB = el.value;
      ui.customDraft.slotB = "";
      render();
      return;
    default:
      return;
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  switch (el.dataset.field) {
    case "tourney-name":
      ui.createForm.name = el.value;
      render();
      break;
    case "tourney-search":
      ui.createSearch = el.value;
      render();
      break;
    case "group-label":
      ui.customDraft.groupLabel = el.value;
      break;
    default:
      break;
  }
});

render();
