// state.js — shared across every page. Load this BEFORE any page-specific script.

const STORAGE_KEY = "crankmintonState";

const CATEGORIES = [
  "Advance",
  "Upper Intermediate",
  "Lower Intermediate",
  "Beginner",
];
const CATEGORY_SHORT = {
  Advance: "Adv",
  "Upper Intermediate": "Upper Int",
  "Lower Intermediate": "Lower Int",
  Beginner: "Beg",
};
const CATEGORY_STYLE = {
  Advance: { bg: "#E05A4E", fg: "#FFFFFF" },
  "Upper Intermediate": { bg: "#4F8FD1", fg: "#FFFFFF" },
  "Lower Intermediate": { bg: "#F0B23D", fg: "#241A05" },
  Beginner: { bg: "#3FA15E", fg: "#FFFFFF" },
};
const DOUBLES_TYPES = [
  { id: "any", label: "Any" },
  { id: "MX", label: "Mixed" },
  { id: "MD", label: "Men's" },
  { id: "WD", label: "Women's" },
];

// The only legal team skill compositions: same-tier pairs, plus adjacent-tier
// pairs. A match only gets proposed when BOTH teams share the same signature -
// no more Advance+UpperInt facing off against UpperInt+UpperInt.
const SIGNATURES = [
  { id: "any", label: "Any" },
  // Tier 1: preferred compositions - same-tier and adjacent-tier only.
  { id: "adv-adv", label: "Adv + Adv", pair: ["Advance", "Advance"], tier: 1 },
  {
    id: "upper-upper",
    label: "Upper + Upper",
    pair: ["Upper Intermediate", "Upper Intermediate"],
    tier: 1,
  },
  {
    id: "lower-lower",
    label: "Lower + Lower",
    pair: ["Lower Intermediate", "Lower Intermediate"],
    tier: 1,
  },
  {
    id: "beg-beg",
    label: "Beg + Beg",
    pair: ["Beginner", "Beginner"],
    tier: 1,
  },
  {
    id: "adv-upper",
    label: "Adv + Upper",
    pair: ["Advance", "Upper Intermediate"],
    tier: 1,
  },
  {
    id: "upper-lower",
    label: "Upper + Lower",
    pair: ["Upper Intermediate", "Lower Intermediate"],
    tier: 1,
  },
  {
    id: "lower-beg",
    label: "Lower + Beg",
    pair: ["Lower Intermediate", "Beginner"],
    tier: 1,
  },
  // Tier 2: wide-gap fallback compositions - only used by "Any" when NO tier-1
  // composition is possible right now. Not offered as their own filter chips -
  // reaching them on purpose is what Manual match is for.
  {
    id: "adv-lower",
    label: "Adv + Lower (wide gap)",
    pair: ["Advance", "Lower Intermediate"],
    tier: 2,
  },
  {
    id: "adv-beg",
    label: "Adv + Beg (wide gap)",
    pair: ["Advance", "Beginner"],
    tier: 2,
  },
  {
    id: "upper-beg",
    label: "Upper + Beg (wide gap)",
    pair: ["Upper Intermediate", "Beginner"],
    tier: 2,
  },
];

// ---------- persistence ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read saved session:", e);
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

function hasActiveSession() {
  const s = loadState();
  return !!(
    s &&
    (s.players.length > 0 ||
      s.courts.some((c) => c.status !== "idle") ||
      (s.stagedMatches && s.stagedMatches.length > 0))
  );
}

function defaultState(courtCount) {
  const courts = [];
  for (let i = 1; i <= courtCount; i++) {
    courts.push({
      id: i,
      label: `Court ${i}`,
      status: "idle",
      match: null,
      reservedFor: null,
    });
  }
  return {
    players: [],
    nextPlayerId: 1,
    courts,
    nextCourtId: courtCount + 1,
    stagedMatches: [],
    nextStagedId: 1,
    logs: [],
    nextLogId: 1,
    tournaments: [],
    nextTournamentId: 1,
    finance: {
      currency: "AED",
      ratePerHour: 0, // persists across sessions - court rental rate rarely changes
      pricePerShuttle: 0, // persists across sessions
      totalHours: 0, // resets each session
      shuttleCount: 0, // resets each session
    },
  };
}

// Backfills fields added after a session may already have been saved, so
// older saved data doesn't crash newer page code with undefined reads.
// Also migrates the old per-court "proposed" status (removed once matches
// moved to the shared staging list) into a staged match, so a session saved
// before that change doesn't just lose an in-progress proposal.
function normalizeState(s) {
  s.players.forEach((p) => {
    if (typeof p.resting !== "boolean") p.resting = false;
    if (typeof p.pairNextWith === "undefined") p.pairNextWith = null;
    if (!Array.isArray(p.partnerHistory)) p.partnerHistory = [];
    if (!Array.isArray(p.opponentHistory)) p.opponentHistory = [];
    if (typeof p.queuedSince === "undefined")
      p.queuedSince = p.queued ? Date.now() : null;
    if (typeof p.financeCheckedIn !== "boolean") p.financeCheckedIn = false;
    if (typeof p.paid !== "boolean") p.paid = false;
  });
  if (!s.finance)
    s.finance = {
      currency: "AED",
      ratePerHour: 0,
      pricePerShuttle: 0,
      totalHours: 0,
      shuttleCount: 0,
    };
  if (!Array.isArray(s.stagedMatches)) s.stagedMatches = [];
  if (typeof s.nextStagedId !== "number") s.nextStagedId = 1;
  if (!Array.isArray(s.tournaments)) s.tournaments = [];
  if (typeof s.nextTournamentId !== "number") s.nextTournamentId = 1;
  s.tournaments.forEach((t) => {
    if (!t.customMerges)
      t.customMerges = { advUpper: false, upperLower: false, lowerBeg: false };
    if (typeof t.pointTarget !== "number") t.pointTarget = 21;
    if (typeof t.advanceCount !== "number") t.advanceCount = 2;
    if (!Array.isArray(t.fixtures)) t.fixtures = [];
    if (!t.brackets) t.brackets = {};
    if (!t.bo3Rounds) t.bo3Rounds = { Final: true };
    (t.teams || []).forEach((tm) => {
      if (typeof tm.forfeited !== "boolean") tm.forfeited = false;
    });
    (t.fixtures || []).forEach((f) => {
      if (typeof f.forfeit === "undefined") f.forfeit = null;
    });
    Object.values(t.brackets).forEach((b) => {
      (b.rounds || []).forEach((round) =>
        round.forEach((m) => {
          if (!Array.isArray(m.games)) m.games = [];
          if (!m.format) m.format = "single";
          if (typeof m.forfeit === "undefined") m.forfeit = null;
        }),
      );
    });
  });
  (s.logs || []).forEach((l) => {
    if (typeof l.time !== "number") l.time = null;
  });
  s.courts.forEach((c) => {
    if (typeof c.reservedFor === "undefined") c.reservedFor = null;
    if (c.status === "proposed" && c.match) {
      s.stagedMatches.push({ id: s.nextStagedId++, match: c.match });
      c.status = "idle";
      c.match = null;
    }
  });
  return s;
}

// Every page should call this once on load to get a guaranteed-usable state
// object. If nothing is saved yet, it falls back to a 2-court default so a
// page opened directly (not via index.html) doesn't crash.
function requireState() {
  let s = loadState();
  if (!s) {
    s = defaultState(2);
    saveState(s);
  }
  return normalizeState(s);
}

// ---------- lookups ----------

function getBusyIds(courts) {
  const busy = new Set();
  courts.forEach((c) => {
    if (c.status !== "idle" && c.match) {
      [...c.match.team1, ...c.match.team2].forEach((id) => busy.add(id));
    }
  });
  return busy;
}

// Players locked into a staged-but-not-yet-assigned match are just as
// unavailable as players already on a court - otherwise the same person
// could end up double-booked into two matches at once.
function getStagedBusyIds(stagedMatches) {
  const busy = new Set();
  (stagedMatches || []).forEach((s) => {
    [...s.match.team1, ...s.match.team2].forEach((id) => busy.add(id));
  });
  return busy;
}

function getAllBusyIds(state) {
  const busy = getBusyIds(state.courts);
  getStagedBusyIds(state.stagedMatches).forEach((id) => busy.add(id));
  return busy;
}

function playerById(players, id) {
  return players.find((p) => p.id === id);
}

function winRate(p) {
  if (p.gamesPlayed === 0) return 0;
  return p.wins / p.gamesPlayed;
}

function genderMatchesDoubles(genders, doublesType) {
  if (doublesType === "any") return true;
  if (doublesType === "MD") return genders[0] === "M" && genders[1] === "M";
  if (doublesType === "WD") return genders[0] === "F" && genders[1] === "F";
  if (doublesType === "MX") return genders[0] !== genders[1];
  return true;
}

// ---------- fairness algorithm ----------
// Eligible pool: queued, not currently on a court, not staged into a
// not-yet-assigned match, not resting.
function eligiblePlayers(state) {
  const busy = getAllBusyIds(state);
  return state.players.filter((p) => p.queued && !p.resting && !busy.has(p.id));
}

function countOccurrences(arr, id) {
  return (arr || []).filter((x) => x === id).length;
}

// How many games apart two candidates can be while still letting
// repeat-avoidance influence the pick. Beyond this, fairness (games played)
// always wins outright - variety never costs someone a meaningfully fairer
// match.
const REPEAT_TOLERANCE_GAMES = 2;

// Builds candidate 2-player teams whose categories are exactly [catA, catB]
// (same category twice for a same-tier signature). Priority order, lowest
// (most preferred) first:
//   -2  a mutual "pair for next match" one-off request
//   -1  a locked partner request
//  >=0  free pairing, ranked by the pair's average games played (fairest
//       first); among players within REPEAT_TOLERANCE_GAMES of each other,
//       prefers a partner they haven't already played with this session.
function buildUnitsForPair(state, catA, catB, doublesType) {
  const pool = eligiblePlayers(state);
  const sameCat = catA === catB;
  const listA = pool.filter((p) => p.category === catA);
  const listB = sameCat ? listA : pool.filter((p) => p.category === catB);

  const usedIds = new Set();
  const units = [];

  function tryUnit(a, b, priority) {
    if (!a || !b || a.id === b.id) return;
    if (usedIds.has(a.id) || usedIds.has(b.id)) return;
    if (!genderMatchesDoubles([a.gender, b.gender], doublesType)) return;
    units.push({
      players: [a, b],
      priority,
      games: (a.gamesPlayed + b.gamesPlayed) / 2,
    });
    usedIds.add(a.id);
    usedIds.add(b.id);
  }

  const wanted = [catA, catB].slice().sort();
  function categoriesMatch(p, q) {
    const cats = [p.category, q.category].slice().sort();
    return cats[0] === wanted[0] && cats[1] === wanted[1];
  }

  // pass 1: one-off "pair for next match" requests
  pool.forEach((p) => {
    if (usedIds.has(p.id) || !p.pairNextWith) return;
    const partner = pool.find((q) => q.id === p.pairNextWith);
    if (
      partner &&
      partner.pairNextWith === p.id &&
      categoriesMatch(p, partner)
    ) {
      tryUnit(p, partner, -2);
    }
  });

  // pass 2: locked partner requests
  pool.forEach((p) => {
    if (usedIds.has(p.id) || !p.partnerId) return;
    const partner = pool.find((q) => q.id === p.partnerId);
    if (partner && partner.partnerId === p.id && categoriesMatch(p, partner)) {
      tryUnit(p, partner, -1);
    }
  });

  // pass 3: free pairing, fewest games played first. For each next-least-
  // played unpaired player, pick the best compatible partner within
  // REPEAT_TOLERANCE_GAMES - "best" meaning fewest prior times partnered
  // together. If nobody compatible falls within tolerance, fall back to
  // the closest compatible partner regardless (forming a match beats
  // enforcing variety).
  function bestPartner(a, candidates) {
    let inTolerance = null;
    let fallback = null;
    for (const b of candidates) {
      if (usedIds.has(b.id) || b.id === a.id) continue;
      if (!genderMatchesDoubles([a.gender, b.gender], doublesType)) continue;
      if (
        !fallback ||
        Math.abs(b.gamesPlayed - a.gamesPlayed) <
          Math.abs(fallback.gamesPlayed - a.gamesPlayed)
      )
        fallback = b;
      if (Math.abs(b.gamesPlayed - a.gamesPlayed) <= REPEAT_TOLERANCE_GAMES) {
        const repeats = countOccurrences(a.partnerHistory, b.id);
        if (!inTolerance || repeats < inTolerance.repeats)
          inTolerance = { player: b, repeats };
        if (repeats === 0) break; // can't do better than a never-before partner
      }
    }
    return inTolerance ? inTolerance.player : fallback;
  }

  if (sameCat) {
    const remaining = listA
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);
    remaining.forEach((a) => {
      if (usedIds.has(a.id)) return;
      const b = bestPartner(a, remaining);
      if (b) tryUnit(a, b, (a.gamesPlayed + b.gamesPlayed) / 2);
    });
  } else {
    const remA = listA
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);
    remA.forEach((a) => {
      if (usedIds.has(a.id)) return;
      const remB = listB
        .filter((p) => !usedIds.has(p.id))
        .sort((x, y) => x.gamesPlayed - y.gamesPlayed);
      const b = bestPartner(a, remB);
      if (b) tryUnit(a, b, (a.gamesPlayed + b.gamesPlayed) / 2);
    });
  }

  units.sort((x, y) => x.priority - y.priority);
  return units;
}

function opponentRepeatCount(unitX, unitY) {
  let count = 0;
  unitX.players.forEach((p) => {
    unitY.players.forEach((q) => {
      count += countOccurrences(p.opponentHistory, q.id);
    });
  });
  return count;
}

// Picks which two units actually face off. A locked (priority < 0) unit
// must be used - it's a standing commitment - so it anchors team A and we
// search for its best opponent. Otherwise searches all pairs among the
// fairest handful of units. "Best" = within REPEAT_TOLERANCE_GAMES of each
// other AND fewest prior times these specific players have faced off;
// falls back to the fairest (lowest combined games) pairing if nothing
// clears the tolerance window.
function pickOpposingTeams(units) {
  if (units.length < 2) return null;

  function scoreOf(gamesGap, repeat) {
    return {
      tier: gamesGap <= REPEAT_TOLERANCE_GAMES ? 0 : 1,
      repeat: gamesGap <= REPEAT_TOLERANCE_GAMES ? repeat : 0,
      gamesGap,
    };
  }
  function better(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.repeat !== b.repeat) return a.repeat - b.repeat;
    return a.gamesGap - b.gamesGap;
  }

  if (units[0].priority < 0) {
    const anchor = units[0];
    let best = null;
    for (let i = 1; i < units.length; i++) {
      const cand = units[i];
      const score = scoreOf(
        Math.abs(cand.games - anchor.games),
        opponentRepeatCount(anchor, cand),
      );
      if (!best || better(score, best.score) < 0) best = { unit: cand, score };
    }
    return best ? [anchor, best.unit] : null;
  }

  const pool = units.slice(0, 8); // bound the search - these are already the fairest candidates
  let best = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const score = scoreOf(
        Math.abs(pool[i].games - pool[j].games),
        opponentRepeatCount(pool[i], pool[j]),
      );
      if (!best || better(score, best.score) < 0)
        best = { pair: [pool[i], pool[j]], score };
    }
  }
  return best ? best.pair : null;
}

// A signature-specific proposal for one concrete (non-"any") doubles type.
function proposeForSignature(state, signatureId, doublesType) {
  const sig = SIGNATURES.find((s) => s.id === signatureId);
  if (!sig || !sig.pair) return null;
  const units = buildUnitsForPair(state, sig.pair[0], sig.pair[1], doublesType);
  const pair = pickOpposingTeams(units);
  if (!pair) return null;
  const [a, b] = pair;
  return {
    team1: a.players.map((p) => p.id),
    team2: b.players.map((p) => p.id),
    signature: sig.id,
    doublesType,
  };
}

// Scans every legal signature and takes whichever produces the fairest
// match (lowest real average games played), honoring any outstanding
// "pair for next match" request first if it lands on a legal signature.
function proposeAnySignature(state, doublesType) {
  const pool = eligiblePlayers(state);
  for (const p of pool) {
    if (!p.pairNextWith) continue;
    const partner = pool.find((q) => q.id === p.pairNextWith);
    if (!partner || partner.pairNextWith !== p.id) continue;
    const cats = [p.category, partner.category].slice().sort();
    const sig = SIGNATURES.find(
      (s) =>
        s.pair &&
        s.pair.slice().sort()[0] === cats[0] &&
        s.pair.slice().sort()[1] === cats[1],
    );
    if (!sig) continue;
    const result = proposeForSignature(state, sig.id, doublesType);
    if (result) return result;
  }

  function scanTier(tier) {
    let best = null;
    SIGNATURES.filter((s) => s.tier === tier).forEach((sig) => {
      const result = proposeForSignature(state, sig.id, doublesType);
      if (!result) return;
      const four = [...result.team1, ...result.team2].map((id) =>
        playerById(state.players, id),
      );
      const avgGames = four.reduce((sum, p) => sum + p.gamesPlayed, 0) / 4;
      if (!best || avgGames < best.avgGames) best = { avgGames, match: result };
    });
    return best;
  }

  // Tier 1 (preferred compositions) first, with zero fallback within it - a
  // wide-gap tier-2 match is only ever considered when NOT ONE tier-1
  // composition is possible right now.
  const tier1 = scanTier(1);
  if (tier1) return tier1.match;
  const tier2 = scanTier(2);
  return tier2 ? tier2.match : null;
}

// Randomized order to try concrete gender styles in when the admin left the
// doubles filter on "Any": 50/50 whether mixed is tried first or a
// same-gender style is, and if same-gender, a 50/50 coin for which one.
// Every style is still attempted in some order, so a proposal only truly
// fails if NONE of the three are formable - the randomness picks the style
// variety-wise, it never blocks a match that's otherwise available.
function randomDoublesOrder() {
  const pureFirst = Math.random() < 0.5 ? "MD" : "WD";
  const pureSecond = pureFirst === "MD" ? "WD" : "MD";
  return Math.random() < 0.5
    ? ["MX", pureFirst, pureSecond]
    : [pureFirst, pureSecond, "MX"];
}

// Hard filters: must be checked into the queue, not resting, and the two
// teams must share an identical skill signature (see SIGNATURES above) - no
// fallback on THAT rule. Doubles type is separate: "any" resolves to a
// randomized concrete style (see randomDoublesOrder) which DOES fall back
// through the other styles if the chosen one isn't formable right now.
function generateMatch(state, signatureId, doublesTypeRequested) {
  const targets =
    doublesTypeRequested === "any"
      ? randomDoublesOrder()
      : [doublesTypeRequested];
  for (const target of targets) {
    const result =
      signatureId !== "any"
        ? proposeForSignature(state, signatureId, target)
        : proposeAnySignature(state, target);
    if (result) return result;
  }
  return null;
}

// Records that these four players just actually played together, so future
// proposals can favor variety over exact repeats (within the fairness
// tolerance). Call this only when a match is truly committed to a court -
// never for a match that was staged and then cancelled.
function recordMatchHistory(state, match) {
  const [a1, a2] = match.team1.map((id) => playerById(state.players, id));
  const [b1, b2] = match.team2.map((id) => playerById(state.players, id));
  if (a1 && a2) {
    a1.partnerHistory.push(a2.id);
    a2.partnerHistory.push(a1.id);
  }
  if (b1 && b2) {
    b1.partnerHistory.push(b2.id);
    b2.partnerHistory.push(b1.id);
  }
  [a1, a2].forEach((p) => {
    if (!p) return;
    [b1, b2].forEach((q) => {
      if (q) p.opponentHistory.push(q.id);
    });
  });
  [b1, b2].forEach((p) => {
    if (!p) return;
    [a1, a2].forEach((q) => {
      if (q) p.opponentHistory.push(q.id);
    });
  });
}

function genderBadge(g) {
  return `<span class="gender-badge ${g}">${g}</span>`;
}

// Native <select><option> elements can't render HTML/CSS badges in any
// browser - this text-prefix format is the honest alternative for every
// player-picking dropdown in the app.
function playerOptionLabel(p) {
  return `${p.gender} - ${p.name} (${CATEGORY_SHORT[p.category] || p.category})`;
}

function categoryBadge(category) {
  const style = CATEGORY_STYLE[category] || { bg: "#1F4A36", fg: "#F2F5F1" };
  return `<span class="badge" style="background:${style.bg};color:${style.fg}">${esc((CATEGORY_SHORT[category] || category).toUpperCase())}</span>`;
}

// ---------- misc ----------

function esc(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// ---------- tournament helpers (Phase 1: setup + shuffle) ----------

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Randomly pairs a participant list into teams. categoryMode "within" groups
// by category first (separate shuffle per category, separate groups in the
// output); "combined" shuffles everyone together into one group; "custom"
// merges only ADJACENT tiers per customMerges toggles (advUpper, upperLower,
// lowerBeg) - deliberately not arbitrary merges like Adv+Beg, to stay
// consistent with the skill-fairness philosophy used everywhere else in this
// app. Merges chain: checking both advUpper and upperLower folds all three
// into one pool. An odd player left over in any bucket is reported as
// unpaired rather than silently dropped or force-paired - the admin resolves
// it manually in the edit step.
function generateTournamentTeams(
  state,
  participantIds,
  categoryMode,
  nextTeamIdRef,
  customMerges,
) {
  const participants = participantIds
    .map((id) => playerById(state.players, id))
    .filter(Boolean);
  const buckets = [];

  if (categoryMode === "within") {
    CATEGORIES.forEach((cat) => {
      const list = participants.filter((p) => p.category === cat);
      if (list.length > 0) buckets.push({ label: cat, players: list });
    });
  } else if (categoryMode === "custom") {
    let chains = CATEGORIES.map((c) => [c]);
    function mergeContaining(catA, catB) {
      const idxA = chains.findIndex((c) => c.includes(catA));
      const idxB = chains.findIndex((c) => c.includes(catB));
      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) {
        chains[idxA] = chains[idxA].concat(chains[idxB]);
        chains.splice(idxB, 1);
      }
    }
    const m = customMerges || {};
    if (m.advUpper) mergeContaining("Advance", "Upper Intermediate");
    if (m.upperLower)
      mergeContaining("Upper Intermediate", "Lower Intermediate");
    if (m.lowerBeg) mergeContaining("Lower Intermediate", "Beginner");
    chains.forEach((chain) => {
      const list = participants.filter((p) => chain.includes(p.category));
      if (list.length > 0)
        buckets.push({ label: chain.join(" + "), players: list });
    });
  } else {
    buckets.push({ label: "All Players", players: participants });
  }

  const groups = [];
  const teams = [];
  const unpaired = [];

  buckets.forEach((bucket) => {
    const shuffled = shuffleArray(bucket.players);
    const groupTeamIds = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const team = {
        id: nextTeamIdRef.value++,
        players: [shuffled[i].id, shuffled[i + 1].id],
        forfeited: false,
      };
      teams.push(team);
      groupTeamIds.push(team.id);
    }
    if (shuffled.length % 2 === 1)
      unpaired.push(shuffled[shuffled.length - 1].id);
    groups.push({
      id: nextTeamIdRef.value++,
      label: bucket.label,
      teamIds: groupTeamIds,
    });
  });

  return { groups, teams, unpaired };
}

// ---------- tournament helpers (Phase 3: knockout bracket) ----------

// Standard recursive bracket-seeding order: keeps seed 1 and seed 2 on
// opposite halves of the bracket (so they can only meet in the final), and
// recursively does the same within each half. n must be a power of 2.
function seedOrder(n) {
  if (n === 1) return [1];
  const half = seedOrder(n / 2);
  const order = [];
  half.forEach((s) => {
    order.push(s);
    order.push(n + 1 - s);
  });
  return order;
}

// Builds a single-elimination bracket from a group's standings: takes the
// top `advanceCount` teams, seeds them (byes to the top seeds if the count
// isn't a clean power of 2), and lays out every round up front - later
// rounds start with unknown (null) teams that fill in as earlier rounds
// resolve. Returns null if there isn't enough to bracket (fewer than 2
// advancing teams).
// Note: calls computeStandings(), which is defined in tournament.js, not
// here - fine since this is only ever invoked from tournament.html after
// both scripts have loaded, but it means this function can't be called from
// any other page.
function generateKnockoutBracket(t, groupId, nextIdRef, bo3Rounds) {
  const standings = computeStandings(t, groupId);
  const advancing = standings.slice(0, t.advanceCount).map((r) => r.teamId);
  const n = advancing.length;
  if (n < 2) return null;

  let bracketSize = 1;
  while (bracketSize < n) bracketSize *= 2;
  const order = seedOrder(bracketSize);
  const slots = order.map((seedNum) => advancing[seedNum - 1] || null);

  const numRounds = Math.log2(bracketSize);
  const rounds = [];
  const fmt = (r) =>
    bo3Rounds && bo3Rounds[roundLabel(r, numRounds)] ? "bo3" : "single";

  const round0 = [];
  const round0Format = fmt(0);
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i],
      b = slots[i + 1];
    const isBye = !a || !b;
    round0.push({
      id: nextIdRef.value++,
      teamAId: a,
      teamBId: b,
      scoreA: null,
      scoreB: null,
      games: [],
      format: round0Format,
      forfeit: null,
      winnerId: isBye ? a || b || null : null,
      isBye,
    });
  }
  rounds.push(round0);

  for (let r = 1; r < numRounds; r++) {
    const count = rounds[r - 1].length / 2;
    const format = fmt(r);
    const round = [];
    for (let i = 0; i < count; i++) {
      round.push({
        id: nextIdRef.value++,
        teamAId: null,
        teamBId: null,
        scoreA: null,
        scoreB: null,
        games: [],
        format,
        forfeit: null,
        winnerId: null,
        isBye: false,
      });
    }
    rounds.push(round);
  }

  const bracket = { seedTeamIds: advancing, rounds };
  advanceBracket(bracket);
  return bracket;
}

// Recomputes every round after the first from the winners of the round
// before it. Safe to call after any score is saved - fully idempotent
// rather than incrementally patched, so there's no risk of a stale slot.
function advanceBracket(bracket) {
  for (let r = 0; r < bracket.rounds.length - 1; r++) {
    const round = bracket.rounds[r];
    const nextRound = bracket.rounds[r + 1];
    for (let i = 0; i < round.length; i += 2) {
      const feederA = round[i],
        feederB = round[i + 1];
      const nextMatch = nextRound[i / 2];
      nextMatch.teamAId = feederA.winnerId || null;
      nextMatch.teamBId = feederB.winnerId || null;
    }
  }
}

function roundLabel(roundIndex, numRounds) {
  const remaining = numRounds - roundIndex;
  if (remaining === 1) return "Final";
  if (remaining === 2) return "Semifinal";
  if (remaining === 3) return "Quarterfinal";
  return `Round of ${Math.pow(2, remaining)}`;
}

function bracketChampionId(bracket) {
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  return finalRound[0] ? finalRound[0].winnerId : null;
}

// Lists every group, across every non-complete tournament, that a court
// could reasonably be reserved for - used by Queue's reservation picker.
function activeTournamentGroups(state) {
  const list = [];
  (state.tournaments || []).forEach((t) => {
    if (t.status === "complete") return;
    t.groups.forEach((g) => {
      list.push({
        tournamentId: t.id,
        tournamentName: t.name,
        groupId: g.id,
        groupLabel: g.label,
      });
    });
  });
  return list;
}

// ---------- tournament helpers (Phase 2: schedule, scoring, standings) ----------
// Note: computeStandings, generateRoundRobinFixtures, and groupIsComplete
// for THIS app's actual fixture shape live in tournament.js, not here - it
// owns the fixture/bracket field shapes end to end. Keeping a second,
// differently-shaped copy here was dead code (silently shadowed by
// tournament.js's own definitions at runtime) and just confusing to read.
