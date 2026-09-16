// queue.js — logic for queue.html only

let appState = requireState();

// page-local UI state (not persisted)
let ui = {
  stageFilter: { signature: "any", doublesType: "any" },
  manualOpen: false,
  manualDraft: ["", "", "", ""],
  manualFilter: ["any", "any", "any", "any"],
  finishChoice: {}, // courtId -> 'team1' | 'team2' | null
  editingMatchKey: null, // "court:3" | "staged:5"
  pairPendingId: null, // waiting-queue one-off pairing in progress
};

function persist() {
  saveState(appState);
}

// reserved = busy on a court OR claimed by a not-yet-assigned staged match.
// `except` skips one specific reservation (a court or a staged match) so
// editing that match can still offer its own current players as options.
function reservedExcept(exceptKey) {
  const ids = new Set();
  appState.courts.forEach((c) => {
    if (exceptKey === `court:${c.id}`) return;
    if (c.status !== "idle" && c.match)
      [...c.match.team1, ...c.match.team2].forEach((id) => ids.add(id));
  });
  appState.stagedMatches.forEach((s) => {
    if (exceptKey === `staged:${s.id}`) return;
    [...s.match.team1, ...s.match.team2].forEach((id) => ids.add(id));
  });
  return ids;
}

function findMatchByKey(key) {
  const [kind, idStr] = key.split(":");
  const id = Number(idStr);
  if (kind === "court")
    return appState.courts.find((c) => c.id === id)?.match || null;
  if (kind === "staged")
    return appState.stagedMatches.find((s) => s.id === id)?.match || null;
  return null;
}

// ---------- court actions ----------

function addCourt() {
  appState.courts.push({
    id: appState.nextCourtId++,
    label: `Court ${appState.courts.length + 1}`,
    status: "idle",
    match: null,
  });
  persist();
  render();
}

function removeCourt(id) {
  appState.courts = appState.courts.filter((c) => c.id !== id);
  persist();
  render();
}

function endSession() {
  if (
    !confirm(
      "End session? Courts clear, staged matches are dropped, everyone gets unqueued, and standing partner/rest/pairing flags reset. Roster and stats stay.",
    )
  )
    return;
  appState.courts.forEach((c) => {
    c.status = "idle";
    c.match = null;
  });
  appState.stagedMatches = [];
  appState.players.forEach((p) => {
    p.queued = false;
    p.queuedSince = null;
    p.resting = false;
    p.pairNextWith = null;
    p.partnerId = null;
  });
  ui.finishChoice = {};
  ui.editingMatchKey = null;
  ui.manualOpen = false;
  persist();
  render();
}

// ---------- staging actions ----------

function setStageFilter(key, value) {
  ui.stageFilter = { ...ui.stageFilter, [key]: value };
  render();
}

function proposeStaged() {
  const match = generateMatch(
    appState,
    ui.stageFilter.signature,
    ui.stageFilter.doublesType,
  );
  if (!match) {
    alert(
      "No valid match right now - no two available teams share a legal skill composition (same-tier, or one tier apart) for this filter.",
    );
    return;
  }
  appState.stagedMatches.push({ id: appState.nextStagedId++, match });
  persist();
  render();
}

function openManual() {
  ui.manualOpen = true;
  ui.manualDraft = ["", "", "", ""];
  ui.manualFilter = ["any", "any", "any", "any"];
  render();
}
function cancelManual() {
  ui.manualOpen = false;
  render();
}
function setManualSlot(index, value) {
  ui.manualDraft[index] = value;
}
function confirmManual() {
  const ids = ui.manualDraft.map((v) => (v ? Number(v) : null));
  if (ids.some((v) => !v)) {
    alert("Pick all 4 players first.");
    return;
  }
  if (new Set(ids).size < 4) {
    alert("Each slot needs a different player.");
    return;
  }
  const match = {
    team1: [ids[0], ids[1]],
    team2: [ids[2], ids[3]],
    signature: "custom",
    doublesType: "custom",
  };
  appState.stagedMatches.push({ id: appState.nextStagedId++, match });
  ui.manualOpen = false;
  persist();
  render();
}

function editSlot(key, team, index, newIdStr) {
  const match = findMatchByKey(key);
  if (!match) return;
  match[team][index] = Number(newIdStr);
  persist();
  render();
}

function toggleEditMatch(key) {
  ui.editingMatchKey = ui.editingMatchKey === key ? null : key;
  render();
}

function cancelStaged(stagedId) {
  appState.stagedMatches = appState.stagedMatches.filter(
    (s) => s.id !== stagedId,
  );
  if (ui.editingMatchKey === `staged:${stagedId}`) ui.editingMatchKey = null;
  persist();
  render();
}

// If both players on a team came from a one-off "pair for next match"
// request, clear that request now that it's actually been used.
function clearUsedPairNext(match) {
  [match.team1, match.team2].forEach((team) => {
    const [a, b] = team.map((id) => playerById(appState.players, id));
    if (a && b && a.pairNextWith === b.id && b.pairNextWith === a.id) {
      a.pairNextWith = null;
      b.pairNextWith = null;
    }
  });
}

function assignStaged(stagedId) {
  const idleCourt = appState.courts.find((c) => c.status === "idle");
  if (!idleCourt) {
    alert("No idle court yet - keep this staged until one opens up.");
    return;
  }
  const idx = appState.stagedMatches.findIndex((s) => s.id === stagedId);
  const match = appState.stagedMatches[idx].match;
  appState.stagedMatches.splice(idx, 1);
  idleCourt.status = "inplay";
  match.startedAt = Date.now();
  idleCourt.match = match;
  clearUsedPairNext(match);
  recordMatchHistory(appState, match);
  if (ui.editingMatchKey === `staged:${stagedId}`) ui.editingMatchKey = null;
  persist();
  render();
}

// ---------- in-play court actions ----------

function setFinishChoice(courtId, team) {
  ui.finishChoice[courtId] = team || null;
  render();
}

function finishMatch(courtId) {
  const court = appState.courts.find((c) => c.id === courtId);
  const winnerKey = ui.finishChoice[courtId];
  if (!court || !court.match || !winnerKey) return;
  const winIds = court.match[winnerKey];
  const loseKey = winnerKey === "team1" ? "team2" : "team1";
  const loseIds = court.match[loseKey];

  appState.players.forEach((p) => {
    if (winIds.includes(p.id)) {
      p.gamesPlayed += 1;
      p.wins += 1;
    } else if (loseIds.includes(p.id)) {
      p.gamesPlayed += 1;
      p.losses += 1;
    }
  });

  const winnerNames = winIds
    .map((id) => playerById(appState.players, id)?.name)
    .join(" & ");
  const loserNames = loseIds
    .map((id) => playerById(appState.players, id)?.name)
    .join(" & ");
  appState.logs.unshift({
    id: appState.nextLogId++,
    time: Date.now(),
    text: `${court.label}: ${winnerNames} beat ${loserNames}`,
  });

  court.status = "idle";
  court.match = null;
  delete ui.finishChoice[courtId];
  if (ui.editingMatchKey === `court:${courtId}`) ui.editingMatchKey = null;
  persist();
  render();
}

// ---------- waiting-queue actions ----------

function toggleResting(id) {
  const p = playerById(appState.players, id);
  if (p) p.resting = !p.resting;
  persist();
  render();
}

function startPairPending(id) {
  ui.pairPendingId = id;
  render();
}
function cancelPairPending() {
  ui.pairPendingId = null;
  render();
}
function commitPair(otherId) {
  const a = playerById(appState.players, ui.pairPendingId);
  const b = playerById(appState.players, otherId);
  if (!a || !b || a.id === b.id) {
    ui.pairPendingId = null;
    render();
    return;
  }
  a.pairNextWith = b.id;
  b.pairNextWith = a.id;
  ui.pairPendingId = null;
  persist();
  render();
}
function unpair(id) {
  const p = playerById(appState.players, id);
  if (!p) return;
  const other = p.pairNextWith
    ? playerById(appState.players, p.pairNextWith)
    : null;
  if (other) other.pairNextWith = null;
  p.pairNextWith = null;
  persist();
  render();
}

// ---------- timers ----------

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function updateTimers() {
  appState.courts.forEach((c) => {
    if (c.status !== "inplay" || !c.match || !c.match.startedAt) return;
    const el = document.getElementById(`timer-${c.id}`);
    if (el) el.textContent = formatElapsed(Date.now() - c.match.startedAt);
  });
  appState.players.forEach((p) => {
    if (!p.queuedSince) return;
    const el = document.getElementById(`wait-${p.id}`);
    if (el)
      el.textContent = `\u23F3 ${formatWaitMinutes(Date.now() - p.queuedSince)} waiting`;
  });
}
setInterval(updateTimers, 1000);

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
    <a href="queue.html" class="active">Queue</a>
    <a href="stats.html">Game Stats</a>
    <a href="tournament.html">Tournament</a>
  </div>`;
}

function renderMatchDisplay(key, match) {
  const editing = ui.editingMatchKey === key;
  const sigLabel =
    match.signature !== "custom"
      ? SIGNATURES.find((s) => s.id === match.signature)?.label
      : null;
  const doublesLabel =
    match.doublesType !== "any" && match.doublesType !== "custom"
      ? DOUBLES_TYPES.find((d) => d.id === match.doublesType)?.label
      : null;

  const tags =
    sigLabel || doublesLabel || match.signature === "custom"
      ? `<div class="chip-row" style="margin-bottom:8px;">
         ${sigLabel ? `<span class="badge" style="background:var(--panel-alt);color:var(--ink-soft)">${esc(sigLabel)}</span>` : ""}
         ${doublesLabel ? `<span class="badge" style="background:var(--panel-alt);color:var(--blue)">${esc(doublesLabel)}</span>` : ""}
         ${match.signature === "custom" ? `<span class="badge" style="background:var(--panel-alt);color:var(--amber)">Manual match</span>` : ""}
       </div>`
      : "";

  function optionsFor(currentId) {
    const reserved = reservedExcept(key);
    let pool = appState.players.filter(
      (p) => p.queued && !p.resting && !reserved.has(p.id),
    );
    const current = playerById(appState.players, currentId);
    if (current && !pool.some((p) => p.id === current.id))
      pool = [...pool, current];
    return pool;
  }

  function team(label, ids, teamKey) {
    const rows = ids
      .map((id, i) => {
        const p = playerById(appState.players, id);
        if (!p) return "";
        if (editing) {
          const opts = optionsFor(id)
            .map(
              (o) =>
                `<option value="${o.id}" ${o.id === id ? "selected" : ""}>${esc(playerOptionLabel(o))}</option>`,
            )
            .join("");
          return `<select data-action="edit-slot" data-key="${key}" data-team="${teamKey}" data-index="${i}">${opts}</select>`;
        }
        return `<div class="player-line">${genderBadge(p.gender)} ${esc(p.name)} ${categoryBadge(p.category)}</div>`;
      })
      .join("");
    return `<div class="team-box"><div class="label">${label}</div>${rows}</div>`;
  }

  return `
    ${tags}
    <div class="match-vs-row">
      ${team("Team A", match.team1, "team1")}
      <div class="vs-col">
        <div class="vs-label">vs</div>
        <button class="edit-toggle" data-action="toggle-edit-match" data-key="${key}">${editing ? "Done" : "\u270E Edit"}</button>
      </div>
      ${team("Team B", match.team2, "team2")}
    </div>`;
}

function renderStagePanel() {
  const f = ui.stageFilter;
  const sigChips = SIGNATURES.map(
    (s) =>
      `<button class="chip ${f.signature === s.id ? "active" : ""}" data-action="set-stage-filter" data-key="signature" data-value="${s.id}">${esc(s.label)}</button>`,
  ).join("");
  const doublesChips = DOUBLES_TYPES.map(
    (d) =>
      `<button class="chip ${f.doublesType === d.id ? "active" : ""}" data-action="set-stage-filter" data-key="doublesType" data-value="${d.id}">${esc(d.label)}</button>`,
  ).join("");

  let manualHtml = "";
  if (ui.manualOpen) {
    const busy = getAllBusyIds(appState);
    const pool = appState.players.filter((p) => !busy.has(p.id));
    const labels = [
      "Team A - slot 1",
      "Team A - slot 2",
      "Team B - slot 1",
      "Team B - slot 2",
    ];
    const catOptions = (current) =>
      `<option value="any" ${current === "any" ? "selected" : ""}>Any</option>` +
      CATEGORIES.map(
        (c) =>
          `<option value="${c}" ${current === c ? "selected" : ""}>${CATEGORY_SHORT[c]}</option>`,
      ).join("");
    const rows = [0, 1, 2, 3]
      .map((i) => {
        const catFilter = ui.manualFilter[i];
        const filteredPool =
          catFilter === "any"
            ? pool
            : pool.filter((p) => p.category === catFilter);
        return `
      <div class="manual-slot-row">
        <select data-action="manual-filter" data-index="${i}" class="manual-slot-filter">${catOptions(catFilter)}</select>
        <select data-action="manual-slot" data-index="${i}">
          <option value="">${labels[i]}</option>
          ${filteredPool.map((p) => `<option value="${p.id}" ${ui.manualDraft[i] === String(p.id) ? "selected" : ""}>${esc(playerOptionLabel(p))}</option>`).join("")}
        </select>
      </div>`;
      })
      .join("");
    manualHtml = `
      <div style="margin-top:10px;">
        <div class="filter-label">Manual match - bypasses skill/gender rules entirely. Category filter is just to narrow the list, not a hard rule.</div>
        <div class="manual-slots-grid">${rows}</div>
        <div class="court-actions">
          <button class="btn green small" data-action="confirm-manual">Stage It</button>
          <button class="btn outline small" data-action="cancel-manual">Cancel</button>
        </div>
      </div>`;
  }

  return `
  <div class="panel" style="margin-bottom:14px;">
    <div class="panel-head"><div class="panel-title">Propose a match</div></div>
    <div class="filter-label">Match signature</div>
    <div class="chip-row">${sigChips}</div>
    <div class="filter-label">Doubles type</div>
    <div class="chip-row">${doublesChips}</div>
    <div class="court-actions">
      <button class="btn green" data-action="propose-staged">&#127919; Propose Match</button>
      <button class="btn outline" data-action="open-manual" title="Manually build a match, bypassing the fairness rules">+ Manual</button>
    </div>
    ${manualHtml}
  </div>`;
}

function renderStagedList() {
  if (appState.stagedMatches.length === 0) return "";
  const anyIdle = appState.courts.some((c) => c.status === "idle");
  const cards = appState.stagedMatches
    .map(
      (s, i) => `
    <div class="court-card" style="border-top-color:var(--amber);margin-bottom:12px;">
      <div class="court-head">
        <div class="name">Proposed Match (${i + 1} of ${appState.stagedMatches.length} staged)</div>
      </div>
      ${renderMatchDisplay(`staged:${s.id}`, s.match)}
      <div class="court-actions">
        <button class="btn green small" data-action="assign-staged" data-id="${s.id}" ${anyIdle ? "" : "disabled"}>&#10003; Assign${anyIdle ? "" : " (no idle court)"}</button>
        <button class="btn red small" data-action="cancel-staged" data-id="${s.id}">&#10005; Cancel</button>
      </div>
    </div>`,
    )
    .join("");
  return `<div style="margin-bottom:14px;">${cards}</div>`;
}

function renderCourtCard(court) {
  const statusLabel =
    court.status === "idle" ? "Idle - Awaiting Lineup" : "In Play";
  const stripe = court.status === "idle" ? "var(--line)" : "var(--green)";
  let body = "";

  if (court.status === "inplay" && court.match) {
    const choice = ui.finishChoice[court.id];
    body = `
      ${renderMatchDisplay(`court:${court.id}`, court.match)}
      ${
        choice
          ? `<div class="court-actions">
             <button class="btn amber small" data-action="finish-match" data-court="${court.id}">&#127942; Confirm ${choice === "team1" ? "Team A" : "Team B"} wins</button>
             <button class="btn outline small" data-action="set-finish-choice" data-court="${court.id}">Back</button>
           </div>`
          : `<div class="court-actions">
             <button class="btn outline small" data-action="set-finish-choice" data-court="${court.id}" data-team="team1">Team A won</button>
             <button class="btn outline small" data-action="set-finish-choice" data-court="${court.id}" data-team="team2">Team B won</button>
           </div>`
      }`;
  }

  const timer =
    court.status === "inplay"
      ? `<span class="court-timer" id="timer-${court.id}">0:00</span>`
      : "";

  return `
  <div class="court-card" style="border-top-color:${stripe}">
    <div class="court-head">
      <div class="name">${esc(court.label)}</div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${timer}
        <span class="status">${statusLabel}</span>
        ${court.status === "idle" ? `<button class="rm" data-action="remove-court" data-id="${court.id}">&minus;</button>` : ""}
      </div>
    </div>
    ${body}
  </div>`;
}

function formatWaitMinutes(ms) {
  return `${Math.floor(ms / 60000)}m`;
}

const BEHIND_GAMES_THRESHOLD = 1; // flagged if this many games behind the group average
const WAIT_MINUTES_THRESHOLD = 15; // flagged if waiting this many minutes or more

function renderWaitingItem(p, avgGames, isUpNext) {
  const badges = `${genderBadge(p.gender)} ${categoryBadge(p.category)}`;

  const flags = [];
  if (
    !isUpNext &&
    avgGames > 0 &&
    p.gamesPlayed <= avgGames - BEHIND_GAMES_THRESHOLD
  ) {
    flags.push(`<span class="flag-tag behind">&#9888; Behind</span>`);
  }
  if (!isUpNext && p.queuedSince) {
    const waitedMs = Date.now() - p.queuedSince;
    if (waitedMs >= WAIT_MINUTES_THRESHOLD * 60000) {
      flags.push(
        `<span class="flag-tag waiting" id="wait-${p.id}">&#9203; ${formatWaitMinutes(waitedMs)} waiting</span>`,
      );
    }
  }

  let extra;
  if (isUpNext) {
    extra = `<div class="pair-tag up-next">&#128203; Up next - staged for the next court</div>`;
  } else if (p.pairNextWith) {
    const partner = playerById(appState.players, p.pairNextWith);
    extra = `
      <div class="pair-tag">&#128279; Paired with ${esc(partner ? partner.name : "?")} (next match)
        <button data-action="unpair" data-id="${p.id}">Unpair</button>
      </div>`;
  } else if (ui.pairPendingId === p.id) {
    extra = `
      <div class="pair-picker">
        <span style="font-size:11px;color:var(--ink-soft)">Selecting partner - click another player's "Pair" button, or</span>
        <button data-action="cancel-pair-pending">cancel</button>
      </div>`;
  } else if (ui.pairPendingId) {
    extra = `<div class="waiting-item-actions"><button data-action="commit-pair" data-id="${p.id}">Pair with this player</button></div>`;
  } else {
    extra = `
      <div class="waiting-item-actions">
        <button data-action="toggle-resting" data-id="${p.id}">${p.resting ? "Back" : "Take a Break"}</button>
        <button data-action="start-pair-pending" data-id="${p.id}">Pair for next match</button>
      </div>`;
  }

  return `
  <div class="waiting-item ${p.resting ? "resting" : ""} ${isUpNext ? "up-next" : ""}">
    <div class="waiting-item-top">
      <span style="font-weight:700">${esc(p.name)}</span>
      ${badges}
      ${p.resting ? `<span style="font-size:11px;color:var(--ink-soft)">on break</span>` : ""}
      <span class="g">${p.gamesPlayed}g</span>
    </div>
    ${flags.length ? `<div class="flag-row">${flags.join("")}</div>` : ""}
    ${extra}
  </div>`;
}

function renderQueueTab() {
  const courtBusy = getBusyIds(appState.courts);
  const stagedBusy = getStagedBusyIds(appState.stagedMatches);
  const visible = appState.players
    .filter((p) => p.queued && !courtBusy.has(p.id))
    .sort((a, b) => a.gamesPlayed - b.gamesPlayed);

  const queuedForAvg = appState.players.filter((p) => p.queued);
  const avgGames = queuedForAvg.length
    ? queuedForAvg.reduce((sum, p) => sum + p.gamesPlayed, 0) /
      queuedForAvg.length
    : 0;

  const courtsHtml = appState.courts.map(renderCourtCard).join("");
  const waitingHtml =
    visible.length === 0
      ? `<div class="empty-note">Queue is empty.</div>`
      : visible
          .map((p) => renderWaitingItem(p, avgGames, stagedBusy.has(p.id)))
          .join("");

  return `
  <div class="queue-grid">
    <div>
      <div class="queue-top">
        <button class="btn gray" data-action="add-court">+ Add Court</button>
        <button class="btn amber" data-action="end-session" style="margin-left:auto">End Session</button>
      </div>
      <div class="courts-list" style="margin-bottom:14px;">${courtsHtml}</div>
      ${renderStagePanel()}
      ${renderStagedList()}
    </div>
    <div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Waiting Queue (${visible.length})</div></div>
        ${waitingHtml}
      </div>
    </div>
  </div>`;
}

function render() {
  document.getElementById("app").innerHTML =
    `${renderHeader()}${renderNav()}${renderQueueTab()}`;
  updateTimers();
}

// ---------- event delegation ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = el.dataset.id ? Number(el.dataset.id) : null;
  const courtId = el.dataset.court ? Number(el.dataset.court) : null;

  switch (el.dataset.action) {
    case "add-court":
      addCourt();
      break;
    case "remove-court":
      removeCourt(id);
      break;
    case "end-session":
      endSession();
      break;
    case "set-stage-filter":
      setStageFilter(el.dataset.key, el.dataset.value);
      break;
    case "propose-staged":
      proposeStaged();
      break;
    case "open-manual":
      openManual();
      break;
    case "cancel-manual":
      cancelManual();
      break;
    case "confirm-manual":
      confirmManual();
      break;
    case "assign-staged":
      assignStaged(id);
      break;
    case "cancel-staged":
      cancelStaged(id);
      break;
    case "toggle-edit-match":
      toggleEditMatch(el.dataset.key);
      break;
    case "set-finish-choice":
      setFinishChoice(courtId, el.dataset.team);
      break;
    case "finish-match":
      finishMatch(courtId);
      break;
    case "toggle-resting":
      toggleResting(id);
      break;
    case "start-pair-pending":
      startPairPending(id);
      break;
    case "cancel-pair-pending":
      cancelPairPending();
      break;
    case "commit-pair":
      commitPair(id);
      break;
    case "unpair":
      unpair(id);
      break;
    default:
      break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.action === "edit-slot") {
    editSlot(
      el.dataset.key,
      el.dataset.team,
      Number(el.dataset.index),
      el.value,
    );
    return;
  }
  if (el.dataset.action === "manual-slot") {
    setManualSlot(Number(el.dataset.index), el.value);
    return; // select already shows its own value - no re-render needed
  }
  if (el.dataset.action === "manual-filter") {
    ui.manualFilter[Number(el.dataset.index)] = el.value;
    render();
    return;
  }
});

render();
