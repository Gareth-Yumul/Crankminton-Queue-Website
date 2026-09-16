// stats.js — logic for stats.html only

let appState = requireState();

let ui = {
  shareOpen: false,
};

function persist() {
  saveState(appState);
}

function formatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------- actions ----------

function resetStats() {
  if (
    !confirm(
      "Reset every player's games/wins/losses to zero, clear the session log, and clear repeat-pairing history? Roster and the current live queue/courts are untouched.",
    )
  )
    return;
  appState.players.forEach((p) => {
    p.gamesPlayed = 0;
    p.wins = 0;
    p.losses = 0;
    p.partnerHistory = [];
    p.opponentHistory = [];
  });
  appState.logs = [];
  persist();
  render();
}

function clearEverything() {
  if (
    !confirm(
      "Clear ALL data - the entire roster, all courts, staged matches, and stats. This can't be undone.",
    )
  )
    return;
  appState.players = [];
  appState.courts.forEach((c) => {
    c.status = "idle";
    c.match = null;
  });
  appState.stagedMatches = [];
  appState.logs = [];
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
    <a href="stats.html" class="active">Game Stats</a>
    <a href="tournament.html">Tournament</a>
  </div>`;
}

function rankedPlayers() {
  return [...appState.players].sort((a, b) => {
    const wr = winRate(b) - winRate(a);
    if (wr !== 0) return wr;
    return b.gamesPlayed - a.gamesPlayed;
  });
}

function renderPlayersPanel() {
  const ranked = rankedPlayers();
  if (ranked.length === 0) {
    return `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">All Players (0)</div></div>
      <div class="empty-note">No players yet.</div>
    </div>`;
  }

  const rows = ranked
    .map(
      (p, i) => `
    <div class="stats-row">
      <div class="rank">${i + 1}</div>
      <div class="pname">${esc(p.name)} ${genderBadge(p.gender)} ${categoryBadge(p.category)}</div>
      <div>${p.gamesPlayed}</div>
      <div>${p.wins}</div>
      <div>${p.losses}</div>
      <div class="winrate">${p.gamesPlayed ? Math.round(winRate(p) * 100) : 0}%</div>
    </div>`,
    )
    .join("");

  return `
  <div class="panel">
    <div class="panel-head"><div class="panel-title">All Players (${ranked.length})</div></div>
    <div class="stats-scroll-x">
      <div class="stats-table-inner">
        <div class="stats-table-head">
          <div>#</div><div>Player</div><div>Games</div><div>W</div><div>L</div><div>Win %</div>
        </div>
        <div class="stats-scroll">${rows}</div>
      </div>
    </div>
  </div>`;
}

function renderLogsPanel() {
  if (appState.logs.length === 0) {
    return `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Session Logs</div></div>
      <div class="empty-note">No matches completed yet.</div>
    </div>`;
  }
  const rows = appState.logs
    .map(
      (l) => `
    <div class="log-item">${l.time ? `<span class="log-time">[${formatTime(l.time)}]</span> ` : ""}${esc(l.text)}</div>`,
    )
    .join("");
  return `
  <div class="panel">
    <div class="panel-head"><div class="panel-title">Session Logs</div></div>
    <div class="stats-scroll">${rows}</div>
  </div>`;
}

function renderSharePanel() {
  if (!ui.shareOpen) return "";
  const ranked = rankedPlayers();
  const shareText =
    `Crankminton - Standings\n` +
    ranked
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} - ${p.wins}W ${p.losses}L (${p.gamesPlayed}g)`,
      )
      .join("\n") +
    (appState.logs.length
      ? `\n\nRecent matches:\n${appState.logs
          .slice(0, 15)
          .map((l) => `${l.time ? `[${formatTime(l.time)}] ` : ""}${l.text}`)
          .join("\n")}`
      : "");
  return `
  <div class="panel">
    <div class="panel-head"><div class="panel-title">Share</div></div>
    <textarea readonly rows="8">${esc(shareText)}</textarea>
    <div style="margin-top:8px;"><button class="btn outline small" data-action="close-share">Close</button></div>
  </div>`;
}

function render() {
  document.getElementById("app").innerHTML = `
    ${renderHeader()}
    ${renderNav()}
    <div class="stats-stack">
      ${renderPlayersPanel()}
      ${renderLogsPanel()}
      ${renderSharePanel()}
      <div class="stats-buttons">
        <button class="btn green" data-action="open-share">Share</button>
        <button class="btn gray" data-action="reset-stats">Reset</button>
        <button class="btn red" data-action="clear-everything">Clear</button>
      </div>
    </div>`;
}

// ---------- event delegation ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  switch (el.dataset.action) {
    case "open-share":
      openShare();
      break;
    case "close-share":
      closeShare();
      break;
    case "reset-stats":
      resetStats();
      break;
    case "clear-everything":
      clearEverything();
      break;
    default:
      break;
  }
});

render();
