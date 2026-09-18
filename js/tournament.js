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
  editingScoreKey: null,
  scoreDrafts: {},
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
    pointTarget: 21,
    advanceCount: 2,
    bo3Rounds: { Final: true },
    fixtures: [],
    brackets: {},
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
    forfeited: false,
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

// ---------- actions: Phase 2 - schedule, scoring, standings ----------

function setPointTarget(value) {
  const t = activeTournament();
  if (!t || t.status !== "ready") return;
  t.pointTarget = Number(value);
  persist();
  render();
}

function setAdvanceCount(value) {
  const t = activeTournament();
  if (!t) return;
  const n = Math.max(1, Number(value) || 1);
  t.advanceCount = n;
  persist();
  render();
}

function generateSchedule() {
  const t = activeTournament();
  if (!t || t.status !== "ready") return;
  const skipped = [];
  const fixtures = [];
  t.groups.forEach((g) => {
    if (g.teamIds.length < 2) {
      skipped.push(g.label);
      return;
    }
    for (let i = 0; i < g.teamIds.length; i++) {
      for (let j = i + 1; j < g.teamIds.length; j++) {
        fixtures.push({
          id: t.nextEntityId++,
          groupId: g.id,
          teamAId: g.teamIds[i],
          teamBId: g.teamIds[j],
          scoreA: null,
          scoreB: null,
          forfeit: null,
        });
      }
    }
  });
  if (fixtures.length === 0) {
    alert("No group has 2+ teams yet - nothing to schedule.");
    return;
  }
  if (skipped.length > 0) {
    alert(
      `Heads up: ${skipped.join(", ")} only ${skipped.length === 1 ? "has" : "have"} 1 team, so ${skipped.length === 1 ? "it's" : "they're"} skipped until there's someone to play against.`,
    );
  }
  t.fixtures = fixtures;
  t.status = "group";
  persist();
  render();
}

function reopenReady() {
  const t = activeTournament();
  if (!t) return;
  if (
    t.fixtures.some((f) => f.scoreA !== null) ||
    Object.keys(t.brackets).length > 0
  ) {
    if (
      !confirm(
        "Going back will discard every score entered so far, including any knockout brackets. Continue?",
      )
    )
      return;
  }
  appState.courts.forEach((c) => {
    if (
      c.match &&
      c.match.tournamentRef &&
      c.match.tournamentRef.tournamentId === t.id
    ) {
      c.status = "idle";
      c.match = null;
    }
  });
  t.status = "ready";
  t.fixtures = [];
  t.brackets = {};
  persist();
  render();
}

// ---------- generic score entry (works for group fixtures AND bracket matches) ----------

function findScorableMatch(t, key) {
  const parts = key.split(":");
  if (parts[0] === "fixture")
    return t.fixtures.find((f) => f.id === Number(parts[1]));
  if (parts[0] === "bracket") {
    const groupId = Number(parts[1]),
      r = Number(parts[2]),
      i = Number(parts[3]);
    const b = t.brackets[groupId];
    return b && b.rounds[r] ? b.rounds[r][i] : null;
  }
  return null;
}

function startEditScore(key) {
  const t = activeTournament();
  const m = t && findScorableMatch(t, key);
  ui.editingScoreKey = key;
  ui.scoreDrafts[key] = {
    a: m && m.scoreA !== null ? String(m.scoreA) : "",
    b: m && m.scoreB !== null ? String(m.scoreB) : "",
  };
  render();
}
function cancelEditScore(key) {
  ui.editingScoreKey = null;
  delete ui.scoreDrafts[key];
  render();
}
function saveBo3Game(key) {
  const t = activeTournament();
  if (!t) return;
  const m = findScorableMatch(t, key);
  if (!m || !m.teamAId || !m.teamBId) return;
  const draft = ui.scoreDrafts[key] || {};
  const a = Number(draft.a);
  const b = Number(draft.b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    alert("Enter whole-number scores for both teams.");
    return;
  }
  if (a === b) {
    alert("Scores can't be tied - badminton games don't end in a draw.");
    return;
  }
  if (Math.max(a, b) < t.pointTarget) {
    alert(`The winning score needs to reach ${t.pointTarget} for this game.`);
    return;
  }

  m.games.push({ scoreA: a, scoreB: b });
  const winsA = m.games.filter((g) => g.scoreA > g.scoreB).length;
  const winsB = m.games.filter((g) => g.scoreB > g.scoreA).length;

  ui.editingScoreKey = null;
  delete ui.scoreDrafts[key];

  if (winsA === 2 || winsB === 2) {
    m.winnerId = winsA === 2 ? m.teamAId : m.teamBId;
    freeMatchCourt(t, key);
    const parts = key.split(":");
    if (parts[0] === "bracket") advanceBracket(t.brackets[Number(parts[1])]);
  }
  // else: best-of-3 continues - stays assigned to its current court, if any,
  // for the next game rather than being freed mid-match.

  persist();
  render();
}

function toggleBo3Round(label) {
  const t = activeTournament();
  if (!t) return;
  t.bo3Rounds[label] = !t.bo3Rounds[label];
  persist();
  render();
}

// Pulls a team out of the tournament: any group-stage fixture they haven't
// played yet is recorded as a forfeit loss (no fabricated score, so it can
// never distort point differential), and if they're mid-bracket in an
// active, unplayed, non-bye match, that match resolves the same way and the
// opponent advances immediately. A court currently hosting either of those
// gets freed. Matches the team already finished are untouched.
function forfeitTeam(teamId) {
  const t = activeTournament();
  if (!t) return;
  const team = t.teams.find((tm) => tm.id === teamId);
  if (!team) return;
  if (
    !confirm(
      `Forfeit ${teamLabel(t, teamId)}? Their remaining unplayed matches will be recorded as losses.`,
    )
  )
    return;

  team.forfeited = true;

  t.fixtures.forEach((f) => {
    if (f.scoreA !== null || f.forfeit) return;
    if (f.teamAId === teamId || f.teamBId === teamId) {
      f.forfeit = teamId;
      freeMatchCourt(t, `fixture:${f.id}`);
    }
  });

  Object.entries(t.brackets).forEach(([groupId, bracket]) => {
    bracket.rounds.forEach((round, r) => {
      round.forEach((m, i) => {
        if (m.winnerId || m.isBye) return;
        if (m.teamAId === teamId || m.teamBId === teamId) {
          const key = `bracket:${groupId}:${r}:${i}`;
          m.forfeit = teamId;
          m.winnerId = m.teamAId === teamId ? m.teamBId : m.teamAId;
          freeMatchCourt(t, key);
          advanceBracket(bracket);
        }
      });
    });
  });

  persist();
  render();
}

function saveScore(key) {
  const t = activeTournament();
  if (!t) return;
  const m = findScorableMatch(t, key);
  if (!m || !m.teamAId || !m.teamBId) return;
  if (m.format === "bo3") {
    saveBo3Game(key);
    return;
  }
  const draft = ui.scoreDrafts[key] || {};
  const a = Number(draft.a);
  const b = Number(draft.b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    alert("Enter whole-number scores for both teams.");
    return;
  }
  if (a === b) {
    alert("Scores can't be tied - badminton games don't end in a draw.");
    return;
  }
  const winnerScore = Math.max(a, b);
  if (winnerScore < t.pointTarget) {
    alert(
      `The winning score needs to reach ${t.pointTarget} (this tournament's point target).`,
    );
    return;
  }
  m.scoreA = a;
  m.scoreB = b;
  freeMatchCourt(t, key);

  const parts = key.split(":");
  if (parts[0] === "bracket") {
    m.winnerId = a > b ? m.teamAId : m.teamBId;
    advanceBracket(t.brackets[Number(parts[1])]);
  }

  ui.editingScoreKey = null;
  delete ui.scoreDrafts[key];
  persist();
  render();
}

// ---------- match <-> court bridge (Phase 3) ----------

function findReservedIdleCourt(tournamentId, groupId) {
  return (
    appState.courts.find(
      (c) =>
        c.status === "idle" &&
        c.reservedFor &&
        c.reservedFor.tournamentId === tournamentId &&
        c.reservedFor.groupId === groupId,
    ) || null
  );
}

function courtForMatchKey(t, key) {
  return (
    appState.courts.find(
      (c) =>
        c.match &&
        c.match.tournamentRef &&
        c.match.tournamentRef.tournamentId === t.id &&
        c.match.tournamentRef.key === key,
    ) || null
  );
}

// Pure mutator - no persist/render, so it's safe to call from inside
// saveScore() without an extra redundant render.
function freeMatchCourt(t, key) {
  const court = courtForMatchKey(t, key);
  if (court) {
    court.status = "idle";
    court.match = null;
  }
}

function assignMatchToCourt(key, groupId) {
  const t = activeTournament();
  if (!t) return;
  const m = findScorableMatch(t, key);
  if (!m || !m.teamAId || !m.teamBId) {
    alert("Both teams need to be set before assigning a court.");
    return;
  }
  const court = findReservedIdleCourt(t.id, groupId);
  if (!court) {
    alert(
      "No idle court is reserved for this group right now - reserve one on the Queue page first.",
    );
    return;
  }
  const teamA = t.teams.find((tm) => tm.id === m.teamAId);
  const teamB = t.teams.find((tm) => tm.id === m.teamBId);
  if (!teamA || !teamB) return;
  court.status = "inplay";
  court.match = {
    team1: teamA.players.slice(),
    team2: teamB.players.slice(),
    tournamentRef: { tournamentId: t.id, key },
    startedAt: Date.now(),
  };
  persist();
  render();
}

function releaseCourt(key) {
  const t = activeTournament();
  if (!t) return;
  if (
    !confirm(
      "Free this court without entering a score? You can reassign it later.",
    )
  )
    return;
  freeMatchCourt(t, key);
  persist();
  render();
}

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function updateCourtTimers() {
  const t = activeTournament();
  if (!t || t.status !== "group") return;
  appState.courts.forEach((c) => {
    if (
      !c.match ||
      !c.match.tournamentRef ||
      c.match.tournamentRef.tournamentId !== t.id
    )
      return;
    const el = document.getElementById(
      `t-timer-${c.match.tournamentRef.key.replace(/:/g, "-")}`,
    );
    if (el) el.textContent = formatElapsed(Date.now() - c.match.startedAt);
  });
}
setInterval(updateCourtTimers, 1000);

// ---------- knockout bracket ----------

function generateBracket(groupId) {
  const t = activeTournament();
  if (!t) return;
  if (!groupIsComplete(t, groupId)) {
    alert("This group's round-robin isn't finished yet.");
    return;
  }
  const bracket = generateKnockoutBracket(
    t,
    groupId,
    { value: t.nextEntityId },
    t.bo3Rounds,
  );
  if (!bracket) {
    alert(
      "Fewer than 2 teams are set to advance from this group - nothing to bracket.",
    );
    return;
  }
  t.nextEntityId =
    Math.max(t.nextEntityId, ...bracket.rounds.flat().map((m) => m.id)) + 1;
  t.brackets[groupId] = bracket;
  persist();
  render();
}

function resetBracket(groupId) {
  const t = activeTournament();
  if (!t) return;
  if (
    !confirm(
      "Reset this group's knockout bracket? Any scores entered in it will be lost.",
    )
  )
    return;
  appState.courts.forEach((c) => {
    if (
      c.match &&
      c.match.tournamentRef &&
      c.match.tournamentRef.tournamentId === t.id &&
      c.match.tournamentRef.key.startsWith(`bracket:${groupId}:`)
    ) {
      c.status = "idle";
      c.match = null;
    }
  });
  delete t.brackets[groupId];
  persist();
  render();
}

// ---------- tournament completion ----------

function allGroupsResolved(t) {
  return t.groups.every((g) => {
    if (g.teamIds.length < 2) return true; // nothing to play, trivially resolved
    if (!groupIsComplete(t, g.id)) return false;
    const bracket = t.brackets[g.id];
    if (!bracket) return false;
    return !!bracketChampionId(bracket);
  });
}

function completeTournament() {
  const t = activeTournament();
  if (!t) return;
  if (
    !confirm(
      "Mark this tournament complete? Any courts reserved for it will be released back to casual play.",
    )
  )
    return;
  t.status = "complete";
  appState.courts.forEach((c) => {
    if (c.reservedFor && c.reservedFor.tournamentId === t.id)
      c.reservedFor = null;
    if (
      c.match &&
      c.match.tournamentRef &&
      c.match.tournamentRef.tournamentId === t.id
    ) {
      c.status = "idle";
      c.match = null;
    }
  });
  persist();
  render();
}

// ---------- standings (Phase 2) ----------

function teamLabel(t, teamId) {
  const team = t.teams.find((tm) => tm.id === teamId);
  if (!team) return "?";
  return team.players
    .map((id) => playerById(appState.players, id)?.name || "?")
    .join(" & ");
}

// Ranks teams in a group: most wins first; ties broken by point
// differential, then head-to-head result between just the tied pair, then -
// if truly still tied - a stable (not literally random) fallback by team id,
// clearly labeled as such rather than pretending it's a resolved tiebreak.
function computeStandings(t, groupId) {
  const group = t.groups.find((g) => g.id === groupId);
  if (!group) return [];
  const resolvedFixtures = t.fixtures.filter(
    (f) => f.groupId === groupId && (f.scoreA !== null || f.forfeit),
  );

  const rows = group.teamIds.map((teamId) => {
    let wins = 0,
      losses = 0,
      scored = 0,
      conceded = 0,
      played = 0;
    resolvedFixtures.forEach((f) => {
      if (f.teamAId !== teamId && f.teamBId !== teamId) return;
      played++;
      if (f.forfeit) {
        // forfeits don't contribute fabricated points either way - just a
        // decisive win/loss, so they never distort point differential.
        if (f.forfeit === teamId) losses++;
        else wins++;
        return;
      }
      if (f.teamAId === teamId) {
        scored += f.scoreA;
        conceded += f.scoreB;
        if (f.scoreA > f.scoreB) wins++;
        else losses++;
      } else {
        scored += f.scoreB;
        conceded += f.scoreA;
        if (f.scoreB > f.scoreA) wins++;
        else losses++;
      }
    });
    return {
      teamId,
      wins,
      losses,
      played,
      scored,
      conceded,
      diff: scored - conceded,
    };
  });

  function headToHead(idA, idB) {
    const f = resolvedFixtures.find(
      (x) =>
        (x.teamAId === idA && x.teamBId === idB) ||
        (x.teamAId === idB && x.teamBId === idA),
    );
    if (!f) return 0;
    if (f.forfeit) return f.forfeit === idA ? 1 : -1;
    const aWon =
      (f.teamAId === idA && f.scoreA > f.scoreB) ||
      (f.teamBId === idA && f.scoreB > f.scoreA);
    return aWon ? -1 : 1;
  }

  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.diff !== x.diff) return y.diff - x.diff;
    const h2h = headToHead(x.teamId, y.teamId);
    if (h2h !== 0) return h2h;
    return x.teamId - y.teamId; // stable fallback, not a resolved tiebreak
  });

  return rows;
}

function groupIsComplete(t, groupId) {
  return t.fixtures
    .filter((f) => f.groupId === groupId)
    .every((f) => f.scoreA !== null || f.forfeit);
}

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
      <div class="label">Team${team.forfeited ? ` <span style="color:var(--red);">- Forfeited</span>` : ""}</div>
      <div style="display:flex;gap:6px;">
        ${t.status === "setup" ? `<button class="edit-toggle" data-action="toggle-edit-team" data-id="${team.id}">${editing ? "Done" : "\u270E Edit"}</button>` : ""}
        ${t.status === "setup" ? `<button class="edit-toggle" style="color:var(--red)" data-action="remove-team" data-id="${team.id}">&#10005;</button>` : ""}
        ${t.status === "group" && !team.forfeited ? `<button class="edit-toggle" style="color:var(--red)" data-action="forfeit-team" data-id="${team.id}">Forfeit</button>` : ""}
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
      : "";

  const header = `
    <div class="panel-head">
      <div class="panel-title">${esc(t.name)}</div>
      <button class="btn outline small" data-action="go-to-list">&larr; All Tournaments</button>
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin-bottom:14px;">
      ${t.participantIds.length} participants &middot; ${t.categoryMode === "within" ? "Within-category" : t.categoryMode === "custom" ? "Custom-merged" : "Combined"} shuffle &middot; ${t.pairMode === "shuffle" ? "Random shuffle" : "Custom pairing"}
    </div>`;

  if (t.status === "setup") {
    return `
    <div class="panel">
      ${header}
      ${setupControls}
      ${unassignedHtml}
      ${t.teams.length === 0 ? `<div class="empty-note">No teams yet.</div>` : groupsHtml}
      <div style="margin-top:10px;">${finalizeRow}</div>
    </div>`;
  }

  if (t.status === "ready") {
    return `
    <div class="panel">
      ${header}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span class="badge" style="background:var(--panel-alt);color:var(--green)">Teams finalized</span>
        <button class="btn outline small" data-action="reopen-setup">Re-open setup</button>
      </div>
      ${groupsHtml}
      <div class="panel" style="margin-bottom:14px;">
        <div class="filter-label">Point target (single game)</div>
        <div class="chip-row" style="margin-bottom:12px;">
          ${[21, 25, 30].map((n) => `<button class="chip ${t.pointTarget === n ? "active" : ""}" data-action="set-point-target" data-value="${n}">${n}</button>`).join("")}
        </div>
        <div class="filter-label">Teams advancing per group into the knockout bracket</div>
        <input type="number" min="1" data-field="advance-count" value="${t.advanceCount}" style="max-width:100px;" />
      </div>
      <button class="btn amber" data-action="generate-schedule">Generate Round-Robin Schedule</button>
    </div>`;
  }

  // status === "group"
  const groupSections = t.groups
    .map((g) => renderGroupStageSection(t, g))
    .join("");
  const resolved = allGroupsResolved(t);
  return `
  <div class="panel">
    ${header}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <span class="badge" style="background:var(--panel-alt);color:var(--green)">Group stage - target ${t.pointTarget}</span>
      <button class="btn outline small" data-action="reopen-ready">Edit schedule settings</button>
    </div>
    ${groupSections}
    ${
      resolved
        ? `<button class="btn amber" data-action="complete-tournament">Complete Tournament</button>`
        : `<div style="font-size:12px;color:var(--ink-soft);">Finish every group's round-robin and knockout bracket to complete the tournament.</div>`
    }
  </div>`;
}

function renderGroupStageSection(t, g) {
  const standings = computeStandings(t, g.id);
  const complete = groupIsComplete(t, g.id);
  const fixtures = t.fixtures.filter((f) => f.groupId === g.id);
  const bracket = t.brackets[g.id];

  const standingsRows = standings
    .map(
      (row, i) => `
    <div class="standings-row ${i < t.advanceCount ? "advancing" : ""}">
      <div>${i + 1}</div>
      <div class="pname">${esc(teamLabel(t, row.teamId))}</div>
      <div>${row.played}</div>
      <div>${row.wins}</div>
      <div>${row.losses}</div>
      <div>${row.diff > 0 ? "+" : ""}${row.diff}</div>
    </div>`,
    )
    .join("");

  const fixtureRows = fixtures
    .map((f) =>
      renderScoreRow(
        t,
        f,
        `fixture:${f.id}`,
        teamLabel(t, f.teamAId),
        teamLabel(t, f.teamBId),
        f.groupId,
      ),
    )
    .join("");

  let bracketHtml = "";
  if (fixtures.length > 0) {
    if (!complete) {
      bracketHtml = `<div class="empty-note" style="margin-top:10px;">Knockout bracket unlocks once every fixture above has a score.</div>`;
    } else if (!bracket) {
      bracketHtml = `<button class="btn green small" style="margin-top:10px;" data-action="generate-bracket" data-group="${g.id}">Generate Knockout Bracket (top ${t.advanceCount})</button>`;
    } else {
      bracketHtml = renderBracket(t, g, bracket);
    }
  }

  return `
  <div style="margin-bottom:22px;">
    <div class="panel-sub" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
      ${esc(g.label)}
      ${complete ? `<span class="badge" style="background:var(--panel-alt);color:var(--green)">Round-robin complete</span>` : ""}
    </div>

    ${
      fixtures.length === 0
        ? `<div class="empty-note" style="margin-bottom:10px;">No fixtures in this group (fewer than 2 teams).</div>`
        : `<div class="stats-scroll-x" style="margin-bottom:12px;">
           <div class="stats-table-inner" style="min-width:0;">
             <div class="standings-head">
               <div>#</div><div>Team</div><div>P</div><div>W</div><div>L</div><div>Diff</div>
             </div>
             ${standingsRows}
           </div>
         </div>
         <div style="display:flex;flex-direction:column;gap:8px;">${fixtureRows}</div>`
    }
    ${bracketHtml}
  </div>`;
}

function renderBracket(t, g, bracket) {
  const numRounds = bracket.rounds.length;
  const champion = bracketChampionId(bracket);

  const roundsHtml = bracket.rounds
    .map((round, r) => {
      const isLastRound = r === numRounds - 1;
      const matchesHtml = round
        .map((m, i) => {
          let inner;
          if (m.isBye) {
            const name = teamLabel(t, m.winnerId);
            inner = `<div class="fixture-row"><div class="fixture-team won">${esc(name)}</div><span style="color:var(--ink-soft);font-size:11px;">bye</span></div>`;
          } else if (!m.teamAId || !m.teamBId) {
            inner = `<div class="fixture-row"><div class="fixture-team" style="color:var(--ink-soft);">TBD</div><span style="color:var(--ink-soft);font-size:11px;">vs</span><div class="fixture-team" style="color:var(--ink-soft);">TBD</div></div>`;
          } else {
            inner = renderScoreRow(
              t,
              m,
              `bracket:${g.id}:${r}:${i}`,
              teamLabel(t, m.teamAId),
              teamLabel(t, m.teamBId),
              g.id,
            );
          }
          return `<div class="bracket-match ${isLastRound ? "final-round" : ""}">${inner}</div>`;
        })
        .join("");
      return `
    <div class="bracket-round">
      <div class="bracket-round-label">${esc(roundLabel(r, numRounds))}${bracket.rounds[r][0] && bracket.rounds[r][0].format === "bo3" ? " (Best of 3)" : ""}</div>
      ${matchesHtml}
    </div>`;
    })
    .join("");

  return `
  <div style="margin-top:14px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <div class="panel-title" style="font-size:13px;">Knockout Bracket</div>
      <button class="edit-toggle" style="color:var(--red)" data-action="reset-bracket" data-group="${g.id}">Reset</button>
    </div>
    ${champion ? `<div class="bracket-champion-banner">&#127942; Champion: ${esc(teamLabel(t, champion))}</div>` : ""}
    <div class="bracket-scroll">
      <div class="bracket-tree">${roundsHtml}</div>
    </div>
  </div>`;
}

function renderScoreRow(t, m, key, nameA, nameB, groupId) {
  const editing = ui.editingScoreKey === key;
  const isBo3 = m.format === "bo3";
  const played =
    m.scoreA !== null || !!m.forfeit || (isBo3 && m.winnerId !== null);

  if (m.forfeit) {
    return `
    <div class="fixture-row">
      <div class="fixture-team">${esc(teamLabel(t, m.forfeit))} forfeited</div>
      <span style="color:var(--ink-soft)">&rarr;</span>
      <div class="fixture-team won">${esc(teamLabel(t, m.winnerId))} wins</div>
    </div>`;
  }

  if (editing) {
    const draft = ui.scoreDrafts[key] || { a: "", b: "" };
    const gameLabel = isBo3
      ? `<div style="font-size:11px;color:var(--ink-soft);width:100%;">Game ${m.games.length + 1} of up to 3</div>`
      : "";
    return `
    <div class="fixture-row" style="flex-wrap:wrap;">
      ${gameLabel}
      <div class="fixture-team">${esc(nameA)}</div>
      <input type="number" min="0" data-field="score-${key}-a" value="${esc(draft.a)}" style="width:70px;" />
      <span style="color:var(--ink-soft)">-</span>
      <input type="number" min="0" data-field="score-${key}-b" value="${esc(draft.b)}" style="width:70px;" />
      <div class="fixture-team">${esc(nameB)}</div>
      <button class="btn green small" data-action="save-score" data-key="${key}">Save</button>
      <button class="btn outline small" data-action="cancel-edit-score" data-key="${key}">Cancel</button>
    </div>`;
  }

  let courtLine = "";
  if (!played && groupId !== undefined) {
    const onCourt = courtForMatchKey(t, key);
    if (onCourt) {
      const timerId = `t-timer-${key.replace(/:/g, "-")}`;
      courtLine = `
        <span style="font-size:12px;color:var(--amber)">&#127939; On ${esc(onCourt.label)} - <span id="${timerId}">0:00</span></span>
        <button class="btn outline small" data-action="release-court" data-key="${key}">Free Court</button>`;
    } else {
      const reservedIdle = findReservedIdleCourt(t.id, groupId);
      courtLine = reservedIdle
        ? `<button class="btn outline small" data-action="assign-match-court" data-key="${key}" data-group="${groupId}">Assign to ${esc(reservedIdle.label)}</button>`
        : `<span style="font-size:11px;color:var(--ink-soft)">No idle reserved court for this group yet</span>`;
    }
  }

  if (isBo3) {
    const winsA = m.games.filter((g) => g.scoreA > g.scoreB).length;
    const winsB = m.games.filter((g) => g.scoreB > g.scoreA).length;
    const gamesSummary = m.games
      .map((g, i) => `G${i + 1}: ${g.scoreA}-${g.scoreB}`)
      .join(", ");
    return `
    <div class="fixture-row">
      <div class="fixture-team ${played && winsA > winsB ? "won" : ""}">${esc(nameA)}</div>
      <div class="fixture-score">${winsA}</div>
      <span style="color:var(--ink-soft)">vs</span>
      <div class="fixture-score">${winsB}</div>
      <div class="fixture-team ${played && winsB > winsA ? "won" : ""}">${esc(nameB)}</div>
      ${gamesSummary ? `<span style="font-size:11px;color:var(--ink-soft)">(${esc(gamesSummary)})</span>` : ""}
      ${played ? "" : `<button class="edit-toggle" data-action="start-edit-score" data-key="${key}">Enter Game ${m.games.length + 1}</button>`}
      ${courtLine}
    </div>`;
  }

  return `
  <div class="fixture-row">
    <div class="fixture-team ${played && m.scoreA > m.scoreB ? "won" : ""}">${esc(nameA)}</div>
    <div class="fixture-score">${played ? m.scoreA : "-"}</div>
    <span style="color:var(--ink-soft)">vs</span>
    <div class="fixture-score">${played ? m.scoreB : "-"}</div>
    <div class="fixture-team ${played && m.scoreB > m.scoreA ? "won" : ""}">${esc(nameB)}</div>
    <button class="edit-toggle" data-action="start-edit-score" data-key="${key}">${played ? "\u270E Edit" : "Enter score"}</button>
    ${courtLine}
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
    case "set-point-target":
      setPointTarget(el.dataset.value);
      break;
    case "generate-schedule":
      generateSchedule();
      break;
    case "reopen-ready":
      reopenReady();
      break;
    case "start-edit-score":
      startEditScore(el.dataset.key);
      break;
    case "cancel-edit-score":
      cancelEditScore(el.dataset.key);
      break;
    case "save-score":
      saveScore(el.dataset.key);
      break;
    case "toggle-bo3-round":
      toggleBo3Round(el.dataset.round);
      break;
    case "forfeit-team":
      forfeitTeam(id);
      break;
    case "generate-bracket":
      generateBracket(Number(el.dataset.group));
      break;
    case "reset-bracket":
      resetBracket(Number(el.dataset.group));
      break;
    case "assign-match-court":
      assignMatchToCourt(el.dataset.key, Number(el.dataset.group));
      break;
    case "release-court":
      releaseCourt(el.dataset.key);
      break;
    case "complete-tournament":
      completeTournament();
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
    case "advance-count":
      setAdvanceCount(el.value);
      return;
    default:
      return;
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  const field = el.dataset.field || "";
  if (field.startsWith("score-")) {
    // field is "score-<key>-a" or "score-<key>-b" - <key> itself may
    // contain colons (e.g. "bracket:3:0:1"), so parse from the ends in,
    // not by splitting on every hyphen.
    const side = field.endsWith("-a") ? "a" : field.endsWith("-b") ? "b" : null;
    if (side) {
      const matchKey = field.slice(6, -2); // strip "score-" prefix and "-a"/"-b" suffix
      if (!ui.scoreDrafts[matchKey])
        ui.scoreDrafts[matchKey] = { a: "", b: "" };
      ui.scoreDrafts[matchKey][side] = el.value;
      render();
    }
    return;
  }
  switch (field) {
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
