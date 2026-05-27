// ============================================================
// ReleaseRadar — App root
// ============================================================

function parseHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (h.startsWith("rollout/")) {
    return { kind: "rollout", id: h.slice("rollout/".length) };
  }
  return null;
}

function App() {
  const [nav, setNav]     = useState("timeline");
  const [openId, setOpenId] = useState(null);     // drawer-preview rollout id
  const [createOpen, setCreateOpen] = useState(false);
  const [lockOpen, setLockOpen]     = useState(false);
  const [hashRoute, setHashRoute]   = useState(parseHash());

  // Listen to hashchange so external links / "Copy link" deep-link properly
  React.useEffect(() => {
    const onHash = () => setHashRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const rollouts = window.ROLLOUTS;
  const locks    = window.LOCKS_RAW;

  const openRollout = window.ROLLOUTS.find(r => r.id === openId) || null;
  const detailRollout = hashRoute && hashRoute.kind === "rollout"
    ? window.ROLLOUTS.find(r => r.id === hashRoute.id)
    : null;

  // Helpers for navigating between drawer-preview and full-page
  const openFullPage = (id) => {
    if (!id) return;
    window.location.hash = "rollout/" + id;
    setOpenId(null);
  };
  const closeDetailPage = () => {
    history.pushState("", document.title, window.location.pathname + window.location.search);
    setHashRoute(null);
  };

  return (
    <div className="rr-shell">
      <Sidebar
        active={detailRollout ? null : nav}
        onNav={(n) => { closeDetailPage(); setNav(n); }}
        onCreateRollout={() => setCreateOpen(true)}
        onCreateLock={() => setLockOpen(true)} />
      <main className="rr-main">
        <Header />

        {detailRollout ? (
          <ExecutePanel
            mode="page"
            rollout={detailRollout}
            locks={locks}
            onClose={closeDetailPage} />
        ) : (
          <>
            {nav === "timeline" && (
              <TimelineView
                rollouts={rollouts}
                locks={locks}
                onOpenRollout={setOpenId}
                onCreateRollout={() => setCreateOpen(true)}
                onCreateLock={() => setLockOpen(true)}
                focusedId={openId} />
            )}
            {nav === "list" && (
              <ListView
                rollouts={rollouts}
                onOpenRollout={setOpenId}
                onCreateRollout={() => setCreateOpen(true)}
                focusedId={openId} />
            )}
            {nav === "data"   && <MasterDataView initialTab="products" />}
            {nav === "docs"   && <DocsView />}
            {nav === "locks"  && <LocksOnlyView onCreateLock={() => setLockOpen(true)} />}
          </>
        )}
      </main>

      {!detailRollout && openRollout && (
        <ExecutePanel
          mode="drawer"
          rollout={openRollout}
          locks={locks}
          onOpenFullPage={() => openFullPage(openRollout.id)}
          onClose={() => setOpenId(null)} />
      )}
      <CreateRolloutModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CreateLockModal    open={lockOpen}   onClose={() => setLockOpen(false)} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
