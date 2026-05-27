// Print app — renders main view + execute drawer + create modal stacked vertically.
const { useState } = React;

function PrintApp() {
  const rollouts = window.ROLLOUTS;
  const locks    = window.LOCKS_RAW;
  const openRollout = rollouts.find(r => r.id === "r-101");

  return (
    <div className="rr-print">
      {/* PAGE 1 — Main timeline */}
      <section className="rr-print-page">
        <div className="rr-shell">
          <Sidebar active="timeline" onNav={() => {}} onCreateRollout={() => {}} onCreateLock={() => {}} />
          <main className="rr-main">
            <Header scope={2} onScope={() => {}} />
            <TimelineView
              rollouts={rollouts}
              locks={locks}
              onOpenRollout={() => {}}
              onCreateRollout={() => {}}
              onCreateLock={() => {}}
              focusedId="r-101"
              days={21} />
          </main>
        </div>
      </section>

      {/* PAGE 2 — Execute Rollout */}
      <section className="rr-print-page rr-print-page-2">
        <div className="rr-print-header">
          <div>
            <div className="rr-print-eyebrow">Detail view</div>
            <h1 className="rr-print-h1">Execute Rollout</h1>
          </div>
          <div className="rr-print-foot-meta">ReleaseRadar · {new Date().toLocaleDateString("en-GB", {day:"2-digit", month:"short", year:"numeric"})}</div>
        </div>
        <PrintExecute rollout={openRollout} locks={locks} />
      </section>

      {/* PAGE 3 — Create Rollout */}
      <section className="rr-print-page rr-print-page-3">
        <div className="rr-print-header">
          <div>
            <div className="rr-print-eyebrow">Form</div>
            <h1 className="rr-print-h1">Create Rollout</h1>
          </div>
          <div className="rr-print-foot-meta">Inherits from RolloutType</div>
        </div>
        <PrintCreateRollout />
      </section>

      {/* PAGE 4 — Create Lock */}
      <section className="rr-print-page rr-print-page-4">
        <div className="rr-print-header">
          <div>
            <div className="rr-print-eyebrow">Form</div>
            <h1 className="rr-print-h1">Create Rollout-Sperre</h1>
          </div>
          <div className="rr-print-foot-meta">Blocked time window</div>
        </div>
        <PrintCreateLock />
      </section>
    </div>
  );
}

// We render the Execute panel/modals via inline wrappers (no fixed scrim)
function PrintExecute({ rollout, locks }) {
  return (
    <div className="rr-print-inline-drawer">
      <ExecutePanel rollout={rollout} locks={locks} onClose={() => {}} />
    </div>
  );
}
function PrintCreateRollout() {
  return (
    <div className="rr-print-inline-modal">
      <CreateRolloutModal open={true} onClose={() => {}} />
    </div>
  );
}
function PrintCreateLock() {
  return (
    <div className="rr-print-inline-modal">
      <CreateLockModal open={true} onClose={() => {}} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<PrintApp />);

// Auto-print after fonts + Babel ready
(async function() {
  try { await document.fonts.ready; } catch (e) {}
  await new Promise(r => setTimeout(r, 800));
  window.print();
})();
