// index.js — logic for index.html only

let draftCourtCount = 2;

function renderStart() {
  const card = document.getElementById("startCard");
  const resuming = hasActiveSession();

  if (resuming) {
    const s = loadState();
    const activeCourts = s.courts.filter((c) => c.status !== "idle").length;
    card.innerHTML = `
      <div class="stripe"></div>
      <h1>Crankminton</h1>
      <div class="tagline">A session is already in progress.</div>
      <div class="resume-summary">
        ${s.players.length} player${s.players.length === 1 ? "" : "s"} on roster &middot;
        ${s.courts.length} court${s.courts.length === 1 ? "" : "s"} set up &middot;
        ${activeCourts} court${activeCourts === 1 ? "" : "s"} currently in play
      </div>
      <a class="btn amber full" href="roster.html">Resume Session</a>
      <div class="start-divider">or</div>
      <button class="btn outline full" id="startFreshBtn">Start a New Session Instead</button>
      <div class="persist-note">Data is kept until you click "End Session" on the Queue page.</div>
    `;
    document.getElementById("startFreshBtn").addEventListener("click", () => {
      if (
        confirm(
          "This will erase the current roster, courts, and stats. Continue?",
        )
      ) {
        clearState();
        draftCourtCount = 2;
        renderStart();
      }
    });
    return;
  }

  card.innerHTML = `
    <div class="stripe"></div>
    <h1>Crankminton</h1>
    <div class="tagline">Fair, court-by-court matchmaking for your badminton sessions.</div>
    <div class="court-count-label">How many courts today?</div>
    <div class="court-count-row">
      <button id="minusCourt">&minus;</button>
      <div class="count" id="courtCountDisplay">${draftCourtCount}</div>
      <button id="plusCourt">+</button>
    </div>
    <button class="btn amber full" id="startSessionBtn">Start Session</button>
    <div class="persist-note">Data is kept until you click "End Session" on the Queue page - it will survive refreshes and closing the tab.</div>
  `;

  document.getElementById("minusCourt").addEventListener("click", () => {
    draftCourtCount = Math.max(1, draftCourtCount - 1);
    document.getElementById("courtCountDisplay").textContent = draftCourtCount;
  });
  document.getElementById("plusCourt").addEventListener("click", () => {
    draftCourtCount = Math.min(20, draftCourtCount + 1);
    document.getElementById("courtCountDisplay").textContent = draftCourtCount;
  });
  document.getElementById("startSessionBtn").addEventListener("click", () => {
    saveState(defaultState(draftCourtCount));
    window.location.href = "roster.html";
  });
}

renderStart();
