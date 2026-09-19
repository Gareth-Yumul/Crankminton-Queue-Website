// finance.js — logic for finance.html only

let appState = requireState();

let ui = {
  search: "",
  sortMode: "name-asc", // name-asc | name-desc | unpaid-first
  shareOpen: false,
};

function persist() {
  saveState(appState);
}

// ---------- derived numbers ----------

function financeNumbers() {
  const f = appState.finance;
  const courts = appState.courts.length;
  const courtCost = courts * f.totalHours * f.ratePerHour;
  const shuttleCost = f.pricePerShuttle * f.shuttleCount;
  const totalCost = courtCost + shuttleCost;

  const checkedIn = appState.players.filter((p) => p.financeCheckedIn);
  const checkedInCount = checkedIn.length;
  const costPerPlayer = checkedInCount > 0 ? totalCost / checkedInCount : 0;

  const paidCount = checkedIn.filter((p) => p.paid).length;
  const unpaidCount = checkedInCount - paidCount;
  const collected = paidCount * costPerPlayer;
  const balance = totalCost - collected;
  const progressPct =
    totalCost > 0 ? Math.min(100, (collected / totalCost) * 100) : 0;

  return {
    courts,
    courtCost,
    shuttleCost,
    totalCost,
    checkedInCount,
    costPerPlayer,
    paidCount,
    unpaidCount,
    collected,
    balance,
    progressPct,
  };
}

function money(n) {
  return `${n.toFixed(2)} ${appState.finance.currency}`;
}

// ---------- actions ----------

function setCurrency(v) {
  appState.finance.currency = v || "AED";
  persist();
  render();
}
function setRatePerHour(v) {
  appState.finance.ratePerHour = Math.max(0, Number(v) || 0);
  persist();
  render();
}
function setPricePerShuttle(v) {
  appState.finance.pricePerShuttle = Math.max(0, Number(v) || 0);
  persist();
  render();
}
function setTotalHours(v) {
  appState.finance.totalHours = Math.max(0, Number(v) || 0);
  persist();
  render();
}
function setShuttleCount(v) {
  appState.finance.shuttleCount = Math.max(0, Number(v) || 0);
  persist();
  render();
}

function toggleCheckedIn(id) {
  const p = playerById(appState.players, id);
  if (p) p.financeCheckedIn = !p.financeCheckedIn;
  persist();
  render();
}
function togglePaid(id) {
  const p = playerById(appState.players, id);
  if (p) p.paid = !p.paid;
  persist();
  render();
}
function checkInAll() {
  appState.players.forEach((p) => {
    p.financeCheckedIn = true;
  });
  persist();
  render();
}
function uncheckAllFinance() {
  appState.players.forEach((p) => {
    p.financeCheckedIn = false;
  });
  persist();
  render();
}

function openShare() {
  ui.shareOpen = true;
  render();
}
function closeShare() {
  ui.shareOpen = false;
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
    <a href="tournament.html">Tournament</a>
    <a href="finance.html" class="active">Finance</a>
  </div>`;
}

function renderSummary(n) {
  return `
  <div class="panel" style="margin-bottom:14px;">
    <button class="btn green full" data-action="open-share" style="margin-bottom:16px;">&#128190; Share Finance Summary</button>

    <div class="finance-stats-grid">
      <div><div class="finance-stat-label">Total Cost</div><div class="finance-stat-value">${money(n.totalCost)}</div></div>
      <div><div class="finance-stat-label">Balance</div><div class="finance-stat-value">${money(n.balance)}</div></div>
      <div><div class="finance-stat-label">Checked In</div><div class="finance-stat-value" style="color:var(--blue)">${n.checkedInCount}</div></div>
      <div><div class="finance-stat-label">Cost/Player</div><div class="finance-stat-value">${money(n.costPerPlayer)}</div></div>
      <div><div class="finance-stat-label">Paid</div><div class="finance-stat-value" style="color:var(--green)">${n.paidCount}</div></div>
      <div><div class="finance-stat-label">Unpaid</div><div class="finance-stat-value" style="color:var(--red)">${n.unpaidCount}</div></div>
    </div>

    <div class="finance-progress-track" style="margin-top:16px;">
      <div class="finance-progress-fill" style="width:${n.progressPct}%;"></div>
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">${n.collected.toFixed(2)} collected / ${n.totalCost.toFixed(2)} ${appState.finance.currency} total</div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">
      &#127943; ${n.courts} court${n.courts === 1 ? "" : "s"} &times; ${appState.finance.totalHours} hr${appState.finance.totalHours === 1 ? "" : "s"} &times; ${appState.finance.ratePerHour} ${appState.finance.currency}/hr = ${money(n.courtCost)}
      &nbsp;&middot;&nbsp;
      &#127992; ${appState.finance.shuttleCount} shuttle${appState.finance.shuttleCount === 1 ? "" : "s"} &times; ${appState.finance.pricePerShuttle} ${appState.finance.currency} = ${money(n.shuttleCost)}
    </div>
  </div>`;
}

function renderSettings(n) {
  return `
  <div class="panel" style="margin-bottom:14px;">
    <div class="filter-label">Persists across sessions</div>
    <div class="finance-settings-grid" style="margin-bottom:14px;">
      <div><div class="panel-sub" style="margin-bottom:4px;">Currency</div><input type="text" data-field="finance-currency" value="${esc(appState.finance.currency)}" maxlength="6" /></div>
      <div><div class="panel-sub" style="margin-bottom:4px;">Rate/Hr (per court)</div><input type="number" min="0" step="0.01" data-field="finance-rate" value="${appState.finance.ratePerHour}" /></div>
      <div><div class="panel-sub" style="margin-bottom:4px;">Price/Shuttle</div><input type="number" min="0" step="0.01" data-field="finance-shuttle-price" value="${appState.finance.pricePerShuttle}" /></div>
    </div>

    <div class="filter-label">Resets when you End Session on the Queue page</div>
    <div class="finance-settings-grid">
      <div><div class="panel-sub" style="margin-bottom:4px;">Total Hours</div><input type="number" min="0" step="0.5" data-field="finance-hours" value="${appState.finance.totalHours}" /></div>
      <div><div class="panel-sub" style="margin-bottom:4px;">Shuttles Used</div><input type="number" min="0" data-field="finance-shuttles" value="${appState.finance.shuttleCount}" /></div>
      <div><div class="panel-sub" style="margin-bottom:4px;">Courts</div><div style="font-size:14px;padding:9px 0;color:var(--ink-soft)">${n.courts} (set on Queue page)</div></div>
    </div>
  </div>`;
}

function renderPlayerRow(p) {
  const paidControl = p.financeCheckedIn
    ? `<button class="btn small ${p.paid ? "green" : "red"}" data-action="toggle-paid" data-id="${p.id}">${p.paid ? "Paid" : "Pay"}</button>`
    : `<span style="font-size:12px;color:var(--ink-soft)">Not checked in</span>`;

  return `
  <div class="player-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
      <input type="checkbox" data-action="toggle-checked-in" data-id="${p.id}" ${p.financeCheckedIn ? "checked" : ""} />
      <span style="font-size:11px;color:var(--ink-soft)">Checked in</span>
    </label>
    <span class="name">${esc(p.name)}</span>
    <span style="margin-left:auto;">${paidControl}</span>
  </div>`;
}

function renderPlayerList() {
  let list = appState.players.filter((p) =>
    p.name.toLowerCase().includes(ui.search.toLowerCase()),
  );
  if (ui.sortMode === "name-asc")
    list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (ui.sortMode === "name-desc")
    list = list.slice().sort((a, b) => b.name.localeCompare(a.name));
  if (ui.sortMode === "unpaid-first")
    list = list
      .slice()
      .sort(
        (a, b) =>
          (a.financeCheckedIn && !a.paid ? 0 : 1) -
          (b.financeCheckedIn && !b.paid ? 0 : 1),
      );

  const rows =
    list.length === 0
      ? `<div class="empty-note">${appState.players.length === 0 ? "No players on the roster yet." : "No players match that search."}</div>`
      : list.map(renderPlayerRow).join("");

  const sortLabels = {
    "name-asc": "Name \u25B2 A-Z",
    "name-desc": "Name \u25BC Z-A",
    "unpaid-first": "Unpaid first",
  };
  const sortCycle = {
    "name-asc": "name-desc",
    "name-desc": "unpaid-first",
    "unpaid-first": "name-asc",
  };

  return `
  <div class="panel">
    <div class="bulk-actions">
      <button class="btn amber small" data-action="check-in-all" ${appState.players.length === 0 ? "disabled" : ""}>Check In Everyone</button>
      <button class="btn gray small" data-action="uncheck-all-finance" ${appState.players.length === 0 ? "disabled" : ""}>Uncheck All</button>
    </div>
    <div class="search-sort-row">
      <div class="search-wrap">
        <span class="search-icon">&#128269;</span>
        <input type="text" data-field="finance-search" placeholder="Search players..." value="${esc(ui.search)}" />
      </div>
      <button class="btn outline" data-action="cycle-finance-sort">${sortLabels[ui.sortMode]}</button>
    </div>
    <div data-sort-cycle="${sortCycle[ui.sortMode]}"></div>
    ${rows}
  </div>`;
}

function render() {
  const active = document.activeElement;
  const activeField = active && active.dataset ? active.dataset.field : null;
  const selStart =
    active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd =
    active && "selectionEnd" in active ? active.selectionEnd : null;

  const n = financeNumbers();

  let sharePanel = "";
  if (ui.shareOpen) {
    const summary =
      `Crankminton - Finance Summary\n` +
      `Total: ${money(n.totalCost)} (Court ${money(n.courtCost)} + Shuttles ${money(n.shuttleCost)})\n` +
      `Checked in: ${n.checkedInCount} - Cost/player: ${money(n.costPerPlayer)}\n` +
      `Paid: ${n.paidCount} - Unpaid: ${n.unpaidCount}\n` +
      `Collected: ${n.collected.toFixed(2)} / ${n.totalCost.toFixed(2)} ${appState.finance.currency}\n\n` +
      `Unpaid: ${
        appState.players
          .filter((p) => p.financeCheckedIn && !p.paid)
          .map((p) => p.name)
          .join(", ") || "none"
      }`;
    sharePanel = `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div class="panel-title">Share</div></div>
      <textarea readonly rows="8">${esc(summary)}</textarea>
      <div style="margin-top:8px;"><button class="btn outline small" data-action="close-share">Close</button></div>
    </div>`;
  }

  document.getElementById("app").innerHTML = `
    ${renderHeader()}
    ${renderNav()}
    ${renderSummary(n)}
    ${sharePanel}
    ${renderSettings(n)}
    ${renderPlayerList()}`;

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
    case "open-share":
      openShare();
      break;
    case "close-share":
      closeShare();
      break;
    case "toggle-paid":
      togglePaid(id);
      break;
    case "check-in-all":
      checkInAll();
      break;
    case "uncheck-all-finance":
      uncheckAllFinance();
      break;
    case "cycle-finance-sort": {
      const marker = document.querySelector("[data-sort-cycle]");
      if (marker) {
        ui.sortMode = marker.dataset.sortCycle;
        render();
      }
      break;
    }
    default:
      break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.action === "toggle-checked-in") {
    toggleCheckedIn(Number(el.dataset.id));
    return;
  }
  switch (el.dataset.field) {
    case "finance-currency":
      setCurrency(el.value.trim());
      return;
    default:
      return;
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  switch (el.dataset.field) {
    case "finance-rate":
      setRatePerHour(el.value);
      break;
    case "finance-shuttle-price":
      setPricePerShuttle(el.value);
      break;
    case "finance-hours":
      setTotalHours(el.value);
      break;
    case "finance-shuttles":
      setShuttleCount(el.value);
      break;
    case "finance-search":
      ui.search = el.value;
      render();
      break;
    default:
      break;
  }
});

render();