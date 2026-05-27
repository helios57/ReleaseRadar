// ============================================================
// ReleaseRadar — List view (sortable upcoming-rollouts table)
// ============================================================

const ListView = ({ rollouts, onOpenRollout, onCreateRollout, focusedId }) => {
  // Flatten: every (rollout, stage) becomes a row, sorted by date.
  const rows = React.useMemo(() => {
    const out = [];
    rollouts.forEach(r => {
      r.stages.forEach((st, idx) => {
        const date = window.addDays(window.TODAY, st.offset);
        out.push({
          key: r.id + "-" + idx,
          rollout: r,
          stage: st,
          date,
          offset: st.offset,
        });
      });
    });
    return out.sort((a, b) => a.offset - b.offset);
  }, [rollouts]);

  const [statusFilter, setStatusFilter] = React.useState("all");
  const [productFilter, setProductFilter] = React.useState("all");
  const [windowFilter, setWindowFilter] = React.useState("upcoming"); // upcoming / all / past

  const filtered = rows.filter(r => {
    if (statusFilter !== "all" && r.stage.status !== statusFilter) return false;
    if (productFilter !== "all" && r.rollout.product !== productFilter) return false;
    if (windowFilter === "upcoming" && r.offset < 0) return false;
    if (windowFilter === "past" && r.offset >= 0) return false;
    return true;
  });

  // Group by absolute date for clean visual chunks
  const groups = React.useMemo(() => {
    const g = [];
    let lastKey = null;
    filtered.forEach(r => {
      const k = window.dateKey(r.date);
      if (k !== lastKey) {
        g.push({ key: k, date: r.date, rows: [] });
        lastKey = k;
      }
      g[g.length - 1].rows.push(r);
    });
    return g;
  }, [filtered]);

  const counts = {
    upcoming: rows.filter(r => r.offset >= 0).length,
    scheduled: rows.filter(r => r.stage.status === "scheduled").length,
    active: rows.filter(r => r.stage.status === "active").length,
    blocked: rows.filter(r => r.stage.status === "blocked").length,
    done: rows.filter(r => r.stage.status === "done").length,
  };

  return (
    <div className="rr-list">
      <div className="rr-list-toolbar">
        <div className="rr-list-toolbar-l">
          <div className="rr-month-title">
            <span>Rollouts</span>
            <span className="rr-month-range">{filtered.length} of {rows.length} stages · sorted by date</span>
          </div>
        </div>
        <div className="rr-list-toolbar-r">
          <button className="rr-btn rr-btn-ghost rr-btn-sm">
            <Icon d={ICONS.download} size={13} /> Export CSV
          </button>
          <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onCreateRollout}>
            <Icon d={ICONS.plus} size={13} /> New rollout
          </button>
        </div>
      </div>

      <div className="rr-list-filters">
        <div className="rr-list-filter">
          <span className="rr-list-filter-label">Window</span>
          <div className="rr-seg">
            {[
              { id: "upcoming", label: "Upcoming" },
              { id: "all",      label: "All" },
              { id: "past",     label: "Past" },
            ].map(s => (
              <button key={s.id}
                      className={"rr-seg-item " + (windowFilter === s.id ? "is-active" : "")}
                      onClick={() => setWindowFilter(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rr-list-filter">
          <span className="rr-list-filter-label">Status</span>
          <div className="rr-seg">
            {[
              { id: "all",       label: "All",        count: rows.length },
              { id: "scheduled", label: "Scheduled",  count: counts.scheduled },
              { id: "active",    label: "In flight",  count: counts.active },
              { id: "blocked",   label: "Blocked",    count: counts.blocked },
              { id: "done",      label: "Done",       count: counts.done },
            ].map(s => (
              <button key={s.id}
                      className={"rr-seg-item " + (statusFilter === s.id ? "is-active" : "")}
                      onClick={() => setStatusFilter(s.id)}>
                {s.label} <span className="rr-list-pill">{s.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rr-list-filter">
          <span className="rr-list-filter-label">Product</span>
          <select className="rr-list-select" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="all">All products</option>
            {window.PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rr-list-scroll">
        <table className="rr-list-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Date · Time</th>
              <th style={{ width: 110 }}>Stage</th>
              <th>Rollout</th>
              <th style={{ width: 120 }}>Product</th>
              <th style={{ width: 130 }}>Type</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 140 }}>Pair</th>
              <th style={{ width: 50 }} aria-label="open"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const isToday   = window.dateKey(g.date) === window.dateKey(window.TODAY);
              const isPast    = g.date < window.TODAY && !isToday;
              const dayLabel  = isToday ? "Today" :
                                isPast  ? "Past" :
                                relativeDay(g.date);
              return (
                <React.Fragment key={g.key}>
                  <tr className={"rr-list-daterow " + (isToday ? "is-today " : "") + (isPast ? "is-past" : "")}>
                    <td colSpan={8}>
                      <span className="rr-list-dateday">
                        {g.date.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
                      </span>
                      <span className="rr-list-daterel">{dayLabel}</span>
                      <span className="rr-list-datecount">{g.rows.length} stage{g.rows.length > 1 ? "s" : ""}</span>
                    </td>
                  </tr>
                  {g.rows.map(r => <ListRow key={r.key} row={r} onOpen={onOpenRollout} focusedId={focusedId} />)}
                </React.Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={8} className="rr-list-empty">No rollouts match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ListRow = ({ row, onOpen, focusedId }) => {
  const { rollout, stage, date } = row;
  const type = window.getType(rollout.typeId);
  const product = window.getProduct(rollout.product);
  const stageMeta = STAGE[stage.env];

  return (
    <tr className={"rr-list-row " + (focusedId === rollout.id ? "is-focus" : "")}
        onClick={() => onOpen(rollout.id)}>
      <td>
        <div className="rr-list-time">{stage.time}</div>
        <div className="rr-list-date-sub">
          {date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          <span className="rr-list-window">+{stage.duration}h</span>
        </div>
      </td>
      <td>
        <span className="rr-list-stage" style={{ background: stageMeta.soft, color: stageMeta.color, borderColor: stageMeta.border }}>
          <span className="rr-list-stage-tag" style={{ background: stageMeta.color }}>{stageMeta.short}</span>
          {stageMeta.label.split(" · ")[0]}
        </span>
      </td>
      <td>
        <div className="rr-list-title">{rollout.title}</div>
        <div className="rr-list-id rr-mono rr-muted">{rollout.id}</div>
      </td>
      <td>
        <div className="rr-list-product">
          <span className="rr-prod-dot" style={{ background: window.productColor(rollout.product) }} />
          <span className="rr-mono">{product.name}</span>
        </div>
      </td>
      <td>
        <Badge tone={type.tone}>{type.short}</Badge>
      </td>
      <td>
        <ListStatus status={stage.status} />
      </td>
      <td>
        <div className="rr-list-pair">
          <AvatarStack ids={rollout.pair} size={20} />
          <span className="rr-list-pair-text rr-mono">
            {rollout.pair.map(id => window.getActor(id).initials).join(" · ")}
          </span>
        </div>
      </td>
      <td>
        <button className="rr-icon-btn" onClick={e => { e.stopPropagation(); onOpen(rollout.id); }} title="Open">
          <Icon d={ICONS.chev} size={14} />
        </button>
      </td>
    </tr>
  );
};

const ListStatus = ({ status }) => {
  const map = {
    scheduled: { tone: "info",    label: "scheduled" },
    active:    { tone: "ok",      label: "in flight" },
    blocked:   { tone: "danger",  label: "blocked"   },
    done:      { tone: "neutral", label: "done"      },
    failed:    { tone: "danger",  label: "failed"    },
  };
  const m = map[status] || map.scheduled;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
};

function relativeDay(d) {
  const diff = Math.round((d - window.TODAY) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 0 && diff < 7)  return "in " + diff + " days";
  if (diff < 0 && diff > -7) return Math.abs(diff) + " days ago";
  if (diff >= 7)  return "in " + Math.ceil(diff / 7) + " week" + (diff >= 14 ? "s" : "");
  return Math.ceil(Math.abs(diff) / 7) + " week" + (diff <= -14 ? "s" : "") + " ago";
}

Object.assign(window, { ListView });
