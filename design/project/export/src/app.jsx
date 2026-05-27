// ============================================================
// ReleaseRadar — App root
// ============================================================

function App() {
  const [scope, setScope] = useState(2); // 3 weeks
  const [nav, setNav]     = useState("timeline");
  const [openId, setOpenId] = useState("r-101");
  const [createOpen, setCreateOpen] = useState(false);
  const [lockOpen, setLockOpen]     = useState(false);

  const rollouts = window.ROLLOUTS;
  const locks    = window.LOCKS_RAW;

  const openRollout = window.ROLLOUTS.find(r => r.id === openId) || null;

  const daysForScope = [7, 14, 21, 28][scope];

  return (
    <div className="rr-shell">
      <Sidebar
        active={nav}
        onNav={setNav}
        onCreateRollout={() => setCreateOpen(true)}
        onCreateLock={() => setLockOpen(true)} />
      <main className="rr-main">
        <Header scope={scope} onScope={setScope} />
        <TimelineView
          rollouts={rollouts}
          locks={locks}
          onOpenRollout={setOpenId}
          onCreateRollout={() => setCreateOpen(true)}
          onCreateLock={() => setLockOpen(true)}
          focusedId={openId}
          days={daysForScope} />
      </main>

      {openRollout && (
        <ExecutePanel
          rollout={openRollout}
          locks={locks}
          onClose={() => setOpenId(null)} />
      )}
      <CreateRolloutModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CreateLockModal    open={lockOpen}   onClose={() => setLockOpen(false)} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
