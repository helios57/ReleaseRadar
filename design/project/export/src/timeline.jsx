// ============================================================
// ReleaseRadar — Timeline (cascading Gantt + locks)
// ============================================================

const DAY_W = 56;
const ROW_H = 64;
const LABEL_W = 280;
const DAYS_DEFAULT = 21;

const STAGE_ORDER = ["non-prod", "prod1", "prod2"];

function fmtDay(d)   { return d.toLocaleDateString("en-GB", { day: "2-digit" }); }
function fmtMon(d)   { return d.toLocaleDateString("en-GB", { month: "short" }); }
function fmtWD(d)    { return d.toLocaleDateString("en-GB", { weekday: "short" }); }
function sameDay(a,b){ return window.dateKey(a) === window.dateKey(b); }

// Expand a lock to its column range relative to viewport start
function lockSpan(lock, start) {
  const lockStart = window.addDays(window.TODAY, lock.startOffset);
  const lockEnd   = window.addDays(window.TODAY, lock.endOffset);
  const startDelta = Math.floor((lockStart - start) / 86400000);
  const endDelta   = Math.floor((lockEnd   - start) / 86400000);
  return { left: startDelta * DAY_W, width: (endDelta - startDelta + 1) * DAY_W };
}

// ---------- The cascading pill ----------
const StagePill = ({ stage, dayIndex, onClick, active }) => {
  const s = STAGE[stage.env];
  const left = dayIndex * DAY_W + 4;
  const width = Math.max(28, (stage.duration || 1) * DAY_W - 8);
  const isBlocked = stage.status === "blocked";
  const isActive  = stage.status === "active";
  const isDone    = stage.status === "done";
  return (
    <button
      onClick={onClick}
      className={"rr-pill " + (active ? "is-focus " : "") + (isBlocked ? "is-blocked" : "")}
      style={{
        left, width, top: 10, height: ROW_H - 20,
        background: `linear-gradient(180deg, ${s.soft}, rgba(0,0,0,0))`,
        borderColor: s.border, color: s.color,
      }}
      title={`${s.label} · ${stage.time}`}
    >
      <span className="rr-pill-tag" style={{ background: s.color }}>{s.short}</span>
      <span className="rr-pill-body">
        <span className="rr-pill-time" style={{ color: s.color }}>{stage.time}</span>
        <span className="rr-pill-meta">
          {isDone   && <><span className="rr-pill-dot is-done" /> done</>}
          {isActive && <><span className="rr-pill-dot is-active" /> in flight</>}
          {isBlocked&& <><span className="rr-pill-dot is-blocked" /> locked</>}
          {stage.status === "scheduled" && <>+{stage.duration}h window</>}
        </span>
      </span>
      {isActive && <span className="rr-pill-pulse" style={{ background: s.color }} />}
    </button>
  );
};

// ---------- Cascade connector ----------
const Cascade = ({ fromIdx, toIdx, color }) => {
  const left  = fromIdx * DAY_W + DAY_W / 2 + 16;
  const right = toIdx   * DAY_W + DAY_W / 2 - 16;
  const w = right - left;
  if (w <= 0) return null;
  return (
    <div className="rr-cascade" style={{ left, width: w, top: ROW_H / 2 - 1 }}>
      <span className="rr-cascade-line" style={{ background: `linear-gradient(90deg, ${color} 0%, ${color} 100%)` }} />
      <span className="rr-cascade-arrow" style={{ borderLeftColor: color }} />
      <span className="rr-cascade-label">
        +{Math.round(w / DAY_W) + 0}d
      </span>
    </div>
  );
};

// ---------- One rollout row ----------
const RolloutRow = ({ rollout, start, days, onOpen, focusedId }) => {
  const type = window.getType(rollout.typeId);
  const product = window.getProduct(rollout.product);

  // Place stages by day-offset from viewport start
  const placed = rollout.stages.map(st => {
    const date = window.addDays(window.TODAY, st.offset);
    const idx = Math.floor((date - start) / 86400000);
    return { stage: st, idx };
  });

  return (
    <div className="rr-row" style={{ height: ROW_H }}>
      <div className="rr-row-label">
        <div className="rr-row-label-top">
          <span className="rr-prod-dot" style={{ background: window.productColor(rollout.product) }} />
          <span className="rr-row-product">{product.name}</span>
          <Badge tone={type.tone}>{type.short}</Badge>
        </div>
        <div className="rr-row-title">{rollout.title}</div>
        <div className="rr-row-meta">
          <AvatarStack ids={rollout.pair} size={18} />
          <span className="rr-row-actors-text">
            {rollout.pair.map(id => window.getActor(id).name.split(" ")[0]).join(" & ")}
          </span>
        </div>
      </div>

      <div className="rr-row-track">
        {/* cascade connectors */}
        {placed.length > 1 && placed.slice(0, -1).map((p, i) => (
          <Cascade key={i} fromIdx={p.idx} toIdx={placed[i + 1].idx}
                   color={STAGE[placed[i + 1].stage.env].color} />
        ))}
        {/* stage pills */}
        {placed.map((p, i) => (
          <StagePill key={i} stage={p.stage} dayIndex={p.idx}
                     onClick={() => onOpen(rollout.id)}
                     active={focusedId === rollout.id} />
        ))}
      </div>
    </div>
  );
};

// ---------- Day header strip ----------
const DaysHeader = ({ start, days, locks }) => {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = window.addDays(start, i);
    const isToday = sameDay(d, window.TODAY);
    const isWE = d.getDay() === 0 || d.getDay() === 6;
    const isFri = window.isFriday(d);

    // group label per Monday
    const showMonth = i === 0 || d.getDate() === 1 || d.getDay() === 1;

    rows.push(
      <div key={i} className={"rr-day " + (isToday ? "is-today " : "") + (isWE ? "is-we " : "") + (isFri ? "is-fri" : "")}
           style={{ width: DAY_W }}>
        <div className="rr-day-wd">{fmtWD(d)}</div>
        <div className="rr-day-num">{fmtDay(d)}</div>
        {showMonth && <div className="rr-day-mon">{fmtMon(d)}</div>}
        {isFri && <div className="rr-day-flag">Fr-Lock</div>}
        {isToday && <div className="rr-day-today">Today</div>}
      </div>
    );
  }
  return <div className="rr-days">{rows}</div>;
};

// ---------- Lock overlay (full timeline height) ----------
const LockOverlay = ({ locks, start, days, totalHeight, onOpenLock }) => (
  <div className="rr-locks-layer" style={{ width: days * DAY_W, height: totalHeight }}>
    {/* Friday auto-locks */}
    {Array.from({ length: days }).map((_, i) => {
      const d = window.addDays(start, i);
      if (!window.isFriday(d)) return null;
      return (
        <div key={"fri" + i} className="rr-lock-col rr-lock-fri"
             style={{ left: i * DAY_W, width: DAY_W, height: totalHeight }}
             title="Friday rule — no rollouts" />
      );
    })}
    {/* Manual + holiday locks */}
    {locks.map(lock => {
      const { left, width } = lockSpan(lock, start);
      if (left + width < 0 || left > days * DAY_W) return null;
      return (
        <button key={lock.id}
                onClick={() => onOpenLock(lock.id)}
                className={"rr-lock-col rr-lock-" + lock.kind}
                style={{ left, width, height: totalHeight }}>
          <span className="rr-lock-label">
            <Icon d={ICONS.lock} size={11} />
            {lock.title}
          </span>
        </button>
      );
    })}
  </div>
);

// ---------- The timeline page ----------
const TimelineView = ({ rollouts, locks, onOpenRollout, onCreateRollout, onCreateLock, focusedId, days = DAYS_DEFAULT }) => {
  const [offset, setOffset] = useState(-3); // start a few days before today
  const start = useMemo(() => window.addDays(window.TODAY, offset), [offset]);
  const trackW = days * DAY_W;
  const todayIdx = Math.floor((window.TODAY - start) / 86400000);
  const totalHeight = rollouts.length * ROW_H;

  return (
    <div className="rr-timeline">
      <div className="rr-tl-toolbar">
        <div className="rr-tl-toolbar-left">
          <div className="rr-month-title">
            <span>{start.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
            <span className="rr-month-range">
              {start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} →{" "}
              {window.addDays(start, days - 1).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </span>
          </div>
          <div className="rr-nav-arrows">
            <button className="rr-icon-btn" onClick={() => setOffset(o => o - 7)} title="Previous week">
              <Icon d={ICONS.chev} size={14} className="rr-rot-180" />
            </button>
            <button className="rr-icon-btn" onClick={() => setOffset(-3)} title="Reset to today">·</button>
            <button className="rr-icon-btn" onClick={() => setOffset(o => o + 7)} title="Next week">
              <Icon d={ICONS.chev} size={14} />
            </button>
          </div>
        </div>
        <div className="rr-tl-toolbar-right">
          <button className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.filter} size={13} /> Filter</button>
          <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={onCreateLock}><Icon d={ICONS.lock} size={13} /> New lock</button>
          <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onCreateRollout}><Icon d={ICONS.plus} size={13} /> New rollout</button>
        </div>
      </div>

      <div className="rr-tl-stats">
        <Stat label="Scheduled" value={rollouts.length} tone="info" />
        <Stat label="In flight"  value={1} tone="ok" />
        <Stat label="Blocked"    value={1} tone="danger" />
        <Stat label="Active locks" value={locks.length + " + Fr"} tone="warn" />
        <Stat label="Window load" value="62%" tone="neutral" sub="vs. 3-wk avg 48%" />
        <Stat label="Cal-DAV subs" value="34" tone="neutral" sub="last sync 4m ago" />
      </div>

      <div className="rr-tl-scroll">
        <div className="rr-tl-grid" style={{ width: LABEL_W + trackW }}>
          {/* sticky left column header */}
          <div className="rr-tl-corner" style={{ width: LABEL_W }}>
            <div className="rr-tl-corner-title">Rollout</div>
            <div className="rr-tl-corner-sub">Product · Type · Pair</div>
          </div>
          <DaysHeader start={start} days={days} locks={locks} />

          {/* body */}
          <div className="rr-tl-body" style={{ width: LABEL_W + trackW }}>
            <div className="rr-tl-bodylabels" style={{ width: LABEL_W }}>
              {rollouts.map(r => (
                <div key={r.id} className="rr-row-label-slot" style={{ height: ROW_H }}>
                  <RolloutRowLabel rollout={r} onOpen={onOpenRollout} focusedId={focusedId} />
                </div>
              ))}
            </div>

            <div className="rr-tl-tracks" style={{ width: trackW, height: totalHeight }}>
              {/* day grid lines */}
              <div className="rr-tl-gridlines" style={{
                width: trackW,
                backgroundImage: `repeating-linear-gradient(90deg,
                  rgba(255,255,255,.04) 0px,
                  rgba(255,255,255,.04) 1px,
                  transparent 1px,
                  transparent ${DAY_W}px)`,
              }} />

              {/* weekend tint */}
              {Array.from({ length: days }).map((_, i) => {
                const d = window.addDays(start, i);
                const we = d.getDay() === 0 || d.getDay() === 6;
                if (!we) return null;
                return <div key={"we" + i} className="rr-tl-weekend" style={{ left: i * DAY_W, width: DAY_W }} />;
              })}

              {/* locks (red diagonal stripes) */}
              <LockOverlay locks={locks} start={start} days={days} totalHeight={totalHeight} onOpenLock={() => {}} />

              {/* today line */}
              {todayIdx >= 0 && todayIdx < days && (
                <div className="rr-today-line" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />
              )}

              {/* rows */}
              {rollouts.map((r, i) => (
                <div key={r.id} className="rr-row-track-wrap" style={{ top: i * ROW_H, height: ROW_H }}>
                  <RolloutTrack rollout={r} start={start} days={days}
                                onOpen={onOpenRollout} focusedId={focusedId} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inline secondary widgets */}
      <div className="rr-below-grid">
        <ActiveLocksCard locks={locks} />
        <ContactsCard />
      </div>
    </div>
  );
};

const Stat = ({ label, value, sub, tone = "neutral" }) => {
  const t = TONE[tone];
  return (
    <div className="rr-stat">
      <div className="rr-stat-label">{label}</div>
      <div className="rr-stat-value" style={{ color: t.fg }}>{value}</div>
      {sub && <div className="rr-stat-sub">{sub}</div>}
    </div>
  );
};

// Label cell (the left column of each rollout row, sticky)
const RolloutRowLabel = ({ rollout, onOpen, focusedId }) => {
  const type = window.getType(rollout.typeId);
  const product = window.getProduct(rollout.product);
  return (
    <button className={"rr-row-label " + (focusedId === rollout.id ? "is-focus" : "")}
            onClick={() => onOpen(rollout.id)}>
      <div className="rr-row-label-top">
        <span className="rr-prod-dot" style={{ background: window.productColor(rollout.product) }} />
        <span className="rr-row-product">{product.name}</span>
        <Badge tone={type.tone}>{type.short}</Badge>
      </div>
      <div className="rr-row-title">{rollout.title}</div>
      <div className="rr-row-meta">
        <AvatarStack ids={rollout.pair} size={18} />
        <span className="rr-row-actors-text">
          {rollout.pair.map(id => window.getActor(id).name.split(" ")[0]).join(" · ")}
        </span>
      </div>
    </button>
  );
};

const RolloutTrack = ({ rollout, start, days, onOpen, focusedId }) => {
  const placed = rollout.stages.map(st => {
    const date = window.addDays(window.TODAY, st.offset);
    const idx = Math.floor((date - start) / 86400000);
    return { stage: st, idx };
  });
  return (
    <div className="rr-row-track">
      {placed.length > 1 && placed.slice(0, -1).map((p, i) => (
        <Cascade key={i} fromIdx={p.idx} toIdx={placed[i + 1].idx}
                 color={STAGE[placed[i + 1].stage.env].color} />
      ))}
      {placed.map((p, i) => (
        <StagePill key={i} stage={p.stage} dayIndex={p.idx}
                   onClick={() => onOpen(rollout.id)}
                   active={focusedId === rollout.id} />
      ))}
    </div>
  );
};

const ActiveLocksCard = ({ locks }) => (
  <section className="rr-card">
    <header className="rr-card-head">
      <h3>Active locks (Rollout-Sperren)</h3>
      <button className="rr-link"><Icon d={ICONS.plus} size={12} /> New lock</button>
    </header>
    <ul className="rr-lock-list">
      {locks.map(l => {
        const tone = l.kind === "manual" ? "danger" : "warn";
        const startD = window.addDays(window.TODAY, l.startOffset);
        const endD   = window.addDays(window.TODAY, l.endOffset);
        return (
          <li key={l.id} className="rr-lock-item">
            <div className="rr-lock-item-stripes" />
            <div className="rr-lock-item-body">
              <div className="rr-lock-item-head">
                <Badge tone={tone}>{l.kind === "manual" ? "MANUAL" : "HOLIDAY"}</Badge>
                <strong>{l.title}</strong>
              </div>
              <p>{l.description}</p>
              <div className="rr-lock-item-foot">
                <span><Icon d={ICONS.cal} size={11} /> {startD.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  {!sameDay(startD, endD) ? " → " + endD.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>
                <span><Icon d={ICONS.user} size={11} /> {l.contact}</span>
                <span><Icon d={ICONS.bolt} size={11} /> {l.products.includes("all") ? "all products" : l.products.join(", ")}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  </section>
);

const CONTACTS = [
  { product: "operator",     contact: "Solace Ops — Lukas R.", channel: "#tms-platform", snow: "CHG / std-23"   },
  { product: "concentrator", contact: "Customer Success — Eva G.", channel: "#tms-cs", snow: "CHG required"      },
  { product: "monalesy",     contact: "Tenant Owners",         channel: "#monalesy",     snow: "CHG (if prod)"   },
  { product: "microservices",contact: "Platform Core on-call", channel: "#tms-platform", snow: "—"                },
];

const ContactsCard = () => (
  <section className="rr-card">
    <header className="rr-card-head">
      <h3>Release-Freigabe contacts</h3>
      <span className="rr-card-sub">Who to ping for SNOW changes &amp; release windows</span>
    </header>
    <table className="rr-table">
      <thead>
        <tr><th>Product</th><th>Contact</th><th>Channel</th><th>Change mgmt</th></tr>
      </thead>
      <tbody>
        {CONTACTS.map(c => (
          <tr key={c.product}>
            <td>
              <span className="rr-prod-dot" style={{ background: window.productColor(c.product) }} />
              <span className="rr-table-prod">{c.product}</span>
            </td>
            <td>{c.contact}</td>
            <td><code>{c.channel}</code></td>
            <td>{c.snow}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

Object.assign(window, { TimelineView });
