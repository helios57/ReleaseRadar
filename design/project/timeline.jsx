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

// ---------- Saved filter presets (mock — would come from FiltersEditor) ----------
const SAVED_FILTERS = [
  { id: "f-1", name: "My active rollouts", icon: "rollout", color: "#7c8cff", criteria: { products: [], types: [], statuses: ["scheduled", "active"], actors: ["luc"] } },
  { id: "f-2", name: "Hotfixes only",      icon: "warn",    color: "#ef4444", criteria: { products: [], types: ["tms-ssp-hf", "operator-hf"], statuses: [], actors: [] } },
  { id: "f-3", name: "Frankfurt brokers",  icon: "bolt",    color: "#5eead4", criteria: { products: ["operator", "concentrator"], types: [], statuses: [], actors: [] } },
  { id: "f-4", name: "Blocked / awaiting", icon: "lock",    color: "#fbbf24", criteria: { products: [], types: [], statuses: ["blocked"], actors: [] } },
];

const STATUS_OPTS = [
  { id: "scheduled", label: "scheduled", tone: "info"    },
  { id: "active",    label: "in flight", tone: "ok"      },
  { id: "done",      label: "done",      tone: "neutral" },
  { id: "blocked",   label: "blocked",   tone: "danger"  },
];

const emptyFilter = () => ({ products: [], types: [], statuses: [], actors: [] });

function filterMatch(rollout, f) {
  if (f.products.length && !f.products.includes(rollout.product)) return false;
  if (f.types.length    && !f.types.includes(rollout.typeId))     return false;
  if (f.actors.length   && !rollout.pair.some(p => f.actors.includes(p))) return false;
  if (f.statuses.length && !rollout.stages.some(s => f.statuses.includes(s.status))) return false;
  return true;
}

const FilterPopover = ({ filter, onChange, onClose }) => {
  const toggle = (key, val) => {
    const arr = filter[key];
    onChange({ ...filter, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] });
  };
  const apply = (preset) => onChange({ ...emptyFilter(), ...preset.criteria });
  const clear = () => onChange(emptyFilter());

  const activeCount = filter.products.length + filter.types.length + filter.statuses.length + filter.actors.length;

  return (
    <div className="rr-filter-pop" onClick={e => e.stopPropagation()}>
      <header className="rr-filter-pop-head">
        <strong>Filter timeline</strong>
        <span className="rr-filter-pop-count">{activeCount} active</span>
        <button className="rr-icon-btn" onClick={onClose}><Icon d={ICONS.x} size={12} /></button>
      </header>

      <div className="rr-filter-pop-body">
        <div className="rr-filter-pop-group">
          <div className="rr-filter-pop-label">Saved filters</div>
          <div className="rr-filter-pop-presets">
            {SAVED_FILTERS.map(p => (
              <button key={p.id} className="rr-filter-pop-preset" onClick={() => apply(p)}>
                <span className="rr-md-filter-ic" style={{ background: p.color + "22", color: p.color, borderColor: p.color + "55" }}>
                  <Icon d={ICONS[p.icon]} size={11} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rr-filter-pop-group">
          <div className="rr-filter-pop-label">Product</div>
          <div className="rr-filter-pop-chips">
            {window.PRODUCTS.map(p => {
              const on = filter.products.includes(p.id);
              return (
                <button key={p.id} className={"rr-filter-pop-chip " + (on ? "is-on" : "")} onClick={() => toggle("products", p.id)}>
                  <span className="rr-prod-dot" style={{ background: window.productColor(p.id) }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rr-filter-pop-group">
          <div className="rr-filter-pop-label">Rollout type</div>
          <div className="rr-filter-pop-chips">
            {window.ROLLOUT_TYPES.map(t => {
              const on = filter.types.includes(t.id);
              return (
                <button key={t.id} className={"rr-filter-pop-chip " + (on ? "is-on" : "")} onClick={() => toggle("types", t.id)}>
                  <Badge tone={t.tone}>{t.short}</Badge>
                  <span className="rr-filter-pop-chip-name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rr-filter-pop-group">
          <div className="rr-filter-pop-label">Status</div>
          <div className="rr-filter-pop-chips">
            {STATUS_OPTS.map(s => {
              const on = filter.statuses.includes(s.id);
              return (
                <button key={s.id} className={"rr-filter-pop-chip " + (on ? "is-on" : "")} onClick={() => toggle("statuses", s.id)}>
                  <Badge tone={s.tone} dot>{s.label}</Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rr-filter-pop-group">
          <div className="rr-filter-pop-label">Actor in pair</div>
          <div className="rr-filter-pop-chips">
            {window.ACTORS.filter(a => a.role === "admin").map(a => {
              const on = filter.actors.includes(a.id);
              return (
                <button key={a.id} className={"rr-filter-pop-chip " + (on ? "is-on" : "")} onClick={() => toggle("actors", a.id)}>
                  <Avatar id={a.id} size={18} />
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="rr-filter-pop-foot">
        <button className="rr-link" onClick={clear}>Clear all</button>
        <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onClose}>Done</button>
      </footer>
    </div>
  );
};

// ---------- The timeline page ----------
const TimelineView = ({ rollouts, locks, onOpenRollout, onCreateRollout, onCreateLock, focusedId }) => {
  const [offset, setOffset] = useState(-3); // start a few days before today
  const [filter, setFilter] = useState(emptyFilter());
  const [filterOpen, setFilterOpen] = useState(false);
  const [days, setDays] = useState(28);
  const filterRef = React.useRef(null);
  const wrapperRef = React.useRef(null);

  // Auto-fit: measure container width, compute how many DAY_W columns fit
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - LABEL_W - 2;
      const n = Math.max(7, Math.floor(avail / DAY_W));
      setDays(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = useMemo(() => window.addDays(window.TODAY, offset), [offset]);
  const trackW = days * DAY_W;
  const todayIdx = Math.floor((window.TODAY - start) / 86400000);

  const filteredRollouts = useMemo(() => rollouts.filter(r => filterMatch(r, filter)), [rollouts, filter]);
  const totalHeight = filteredRollouts.length * ROW_H;
  const activeCount = filter.products.length + filter.types.length + filter.statuses.length + filter.actors.length;

  React.useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  return (
    <div className="rr-timeline" ref={wrapperRef}>
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
          <div className="rr-filter-wrap" ref={filterRef}>
            <button
              className={"rr-btn rr-btn-ghost rr-btn-sm " + (activeCount > 0 ? "rr-btn-active" : "")}
              onClick={() => setFilterOpen(o => !o)}>
              <Icon d={ICONS.filter} size={13} /> Filter
              {activeCount > 0 && <span className="rr-filter-badge">{activeCount}</span>}
              <Icon d={ICONS.chev} size={11} className={"rr-rot-90 " + (filterOpen ? "rr-rot-270" : "")} />
            </button>
            {filterOpen && (
              <FilterPopover
                filter={filter}
                onChange={setFilter}
                onClose={() => setFilterOpen(false)}
              />
            )}
          </div>
          <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={onCreateLock}><Icon d={ICONS.lock} size={13} /> New lock</button>
          <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onCreateRollout}><Icon d={ICONS.plus} size={13} /> New rollout</button>
        </div>
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
              {filteredRollouts.map(r => (
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
              {filteredRollouts.map((r, i) => (
                <div key={r.id} className="rr-row-track-wrap" style={{ top: i * ROW_H, height: ROW_H }}>
                  <RolloutTrack rollout={r} start={start} days={days}
                                onOpen={onOpenRollout} focusedId={focusedId} />
                </div>
              ))}
            </div>
          </div>
        </div>
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

const CONTACTS_INIT = [
  { id: "c-1", product: "operator",      name: "Lukas Rüegg",   email: "lukas.ruegg@solace-ops.example",   role: "Solace Ops · primary",       snow: "CHG / std-23",   notes: "Always copy on oracle migrations. Reachable Mon–Fri 08:00–18:00 CET. Vacation backup: see Eva G." },
  { id: "c-2", product: "operator",      name: "Anna Steiner",  email: "anna.steiner@solace-ops.example",  role: "Solace Ops · backup",        snow: "CHG / std-23",   notes: "" },
  { id: "c-3", product: "concentrator",  name: "Eva Gerber",    email: "eva.gerber@customer-success.example", role: "Customer Success · primary", snow: "CHG required",   notes: "Owns customer notification flow for TLS / breaking changes. Requires 1 week notice for prod." },
  { id: "c-4", product: "concentrator",  name: "Tomáš Procházka", email: "tomas.prochazka@customer-success.example", role: "Customer Success · backup", snow: "CHG required",   notes: "" },
  { id: "c-5", product: "monalesy",      name: "Mira Klein",    email: "mira.klein@monalesy.example",      role: "Tenant Owners lead",         snow: "CHG (if prod)",  notes: "Forwards prod-component changes to all tenant owners via mailing list monalesy-owners@…" },
  { id: "c-6", product: "monalesy",      name: "Ravi Nair",     email: "ravi.nair@monalesy.example",       role: "Tenant Owners deputy",       snow: "CHG (if prod)",  notes: "" },
  { id: "c-7", product: "microservices", name: "Sina Wenger",   email: "sina.wenger@platform-core.example",role: "Platform Core on-call",      snow: "—",              notes: "Use the on-call rota in OpsGenie before pinging directly. Acks within 15min during business hours." },
  { id: "c-8", product: "microservices", name: "Henning Hoffer",email: "henning.hoffer@platform-core.example", role: "Platform Core · backup", snow: "—",              notes: "" },
];

const ContactsCard = () => {
  const [contacts, setContacts]  = React.useState(CONTACTS_INIT);
  const [selectedId, setSelected] = React.useState("c-1");
  const [query, setQuery]         = React.useState("");
  const [adding, setAdding]       = React.useState(false);
  const [draft, setDraft]         = React.useState({ name: "", email: "", role: "", product: "operator", notes: "", snow: "—" });
  const [openGroups, setOpenGroups] = React.useState(() => new Set());

  const toggleGroup = (prod) => {
    setOpenGroups(prev => {
      const n = new Set(prev);
      n.has(prod) ? n.delete(prod) : n.add(prod);
      return n;
    });
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.product.toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const selected = contacts.find(c => c.id === selectedId) || filtered[0];

  // Group filtered by product for the list
  const grouped = React.useMemo(() => {
    const m = {};
    filtered.forEach(c => {
      (m[c.product] = m[c.product] || []).push(c);
    });
    return m;
  }, [filtered]);

  const updateSelected = (patch) => {
    setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c));
  };

  const removeSelected = () => {
    if (!selected) return;
    setContacts(prev => {
      const next = prev.filter(c => c.id !== selected.id);
      if (next.length) setSelected(next[0].id);
      return next;
    });
  };

  const addContact = () => {
    if (!draft.name.trim()) return;
    const id = "c-" + (Date.now());
    const c = { id, ...draft, snow: draft.snow || "—" };
    setContacts(prev => [...prev, c]);
    setSelected(id);
    setAdding(false);
    setDraft({ name: "", email: "", role: "", product: "operator", notes: "", snow: "—" });
  };

  return (
    <section className="rr-card rr-contacts">
      <header className="rr-card-head">
        <div>
          <h3>Release-Freigabe contacts</h3>
          <span className="rr-card-sub">Names &amp; emails to notify for SNOW changes &amp; release windows · {contacts.length} entries</span>
        </div>
        <button className="rr-link" onClick={() => setAdding(true)}><Icon d={ICONS.plus} size={12} /> Add contact</button>
      </header>

      <div className="rr-contacts-body">
        {/* LEFT — searchable list */}
        <div className="rr-contacts-list">
          <div className="rr-contacts-search">
            <Icon d={ICONS.search} size={13} />
            <input
              placeholder="Filter by name, email, product…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="rr-contacts-scroll">
            {Object.entries(grouped).map(([prod, items]) => {
              const isOpen = openGroups.has(prod) || !!query.trim();
              return (
                <div key={prod} className="rr-contacts-group">
                  <button
                    className={"rr-contacts-group-head " + (isOpen ? "is-open" : "")}
                    onClick={() => toggleGroup(prod)}
                  >
                    <Icon d={ICONS.chev} size={11} className={"rr-group-chev " + (isOpen ? "is-open" : "")} />
                    <span className="rr-prod-dot" style={{ background: window.productColor(prod) }} />
                    <span className="rr-table-prod">{prod}</span>
                    <span className="rr-contacts-count">{items.length}</span>
                  </button>
                  {isOpen && items.map(c => (
                    <button
                      key={c.id}
                      className={"rr-contact-row " + (selected && selected.id === c.id ? "is-active" : "")}
                      onClick={() => setSelected(c.id)}
                    >
                      <div className="rr-contact-row-name">{c.name}</div>
                      <div className="rr-contact-row-meta">
                        <code>{c.email}</code>
                      </div>
                      <div className="rr-contact-row-role">{c.role}</div>
                    </button>
                  ))}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="rr-contacts-empty">No contacts match “{query}”.</div>
            )}
          </div>
        </div>

        {/* RIGHT — detail */}
        <div className="rr-contacts-detail">
          {adding ? (
            <div className="rr-contact-form">
              <div className="rr-contact-form-head">
                <h4>New contact</h4>
                <button className="rr-icon-btn" onClick={() => setAdding(false)}><Icon d={ICONS.x} size={13} /></button>
              </div>
              <div className="rr-form-grid">
                <label className="rr-field">
                  <span>Product</span>
                  <select value={draft.product} onChange={e => setDraft({ ...draft, product: e.target.value })}>
                    {window.PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="rr-field">
                  <span>Role</span>
                  <input placeholder="e.g. Tenant Owners · backup" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Name</span>
                  <input placeholder="Full name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Email</span>
                  <input type="email" placeholder="name@company.example" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Change mgmt</span>
                  <input placeholder="CHG / std-23 · CHG required · —" value={draft.snow} onChange={e => setDraft({ ...draft, snow: e.target.value })} />
                </label>
                <label className="rr-field rr-field-wide">
                  <span>Notes <em>(internal — when to ping, escalation path, backup contact…)</em></span>
                  <textarea
                    rows={3}
                    placeholder="Free text — context for whoever has to reach this person."
                    value={draft.notes}
                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  />
                </label>
              </div>
              <div className="rr-contact-form-foot">
                <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={() => setAdding(false)}>Cancel</button>
                <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={addContact}>Add contact</button>
              </div>
            </div>
          ) : selected ? (
            <>
              <div className="rr-contact-detail-head">
                <div className="rr-contact-detail-top">
                  <span className="rr-prod-dot" style={{ background: window.productColor(selected.product) }} />
                  <span className="rr-table-prod">{selected.product}</span>
                  <span className="rr-sep">·</span>
                  <span className="rr-contact-role">{selected.role}</span>
                </div>
                <div className="rr-contact-detail-actions">
                  <a className="rr-btn rr-btn-ghost rr-btn-sm" href={"mailto:" + selected.email}>
                    <Icon d={ICONS.link} size={12} /> Email
                  </a>
                  <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={removeSelected}>
                    <Icon d={ICONS.x} size={12} /> Remove
                  </button>
                </div>
              </div>

              <div className="rr-form-grid rr-contact-form-grid">
                <label className="rr-field">
                  <span>Name</span>
                  <input value={selected.name} onChange={e => updateSelected({ name: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Email</span>
                  <input type="email" value={selected.email} onChange={e => updateSelected({ email: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Role / responsibility</span>
                  <input value={selected.role} onChange={e => updateSelected({ role: e.target.value })} />
                </label>
                <label className="rr-field">
                  <span>Change mgmt</span>
                  <input value={selected.snow} onChange={e => updateSelected({ snow: e.target.value })} />
                </label>
                <label className="rr-field rr-field-wide">
                  <span>Notes <em>(internal — when to ping, escalation path, backup contact…)</em></span>
                  <textarea
                    rows={3}
                    placeholder="Free text — context for whoever has to reach this person."
                    value={selected.notes}
                    onChange={e => updateSelected({ notes: e.target.value })} />
                </label>
              </div>
            </>
          ) : (
            <div className="rr-contacts-empty">Select a contact to see details.</div>
          )}
        </div>
      </div>
    </section>
  );
};

Object.assign(window, { TimelineView, ContactsCard });
