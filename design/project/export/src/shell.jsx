// ============================================================
// ReleaseRadar — shared atoms + app shell (sidebar, header)
// ============================================================
const { useState, useMemo, useEffect, useRef } = React;

// ---------- Iconography (inline strokes, no emoji) ----------
const Icon = ({ d, size = 14, stroke = 1.6, className = "", fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);
const ICONS = {
  timeline:  "M3 6h18M3 12h12M3 18h7",
  rollout:   "M4 12h10M4 12l4-4M4 12l4 4M14 4h6v16h-6",
  lock:      "M6 11h12v9H6zM8 11V8a4 4 0 1 1 8 0v3",
  data:      "M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2",
  people:    "M16 11a3 3 0 1 0-3-3M3 20a6 6 0 0 1 12 0M17 13a5 5 0 0 1 4 7M8 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  cal:       "M3 5h18v16H3zM3 9h18M8 3v4M16 3v4",
  download:  "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  search:    "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 5 5",
  plus:      "M12 5v14M5 12h14",
  warn:      "M12 3l10 18H2L12 3zM12 10v5M12 18v.5",
  check:     "M4 12l5 5L20 6",
  x:         "M6 6l12 12M18 6L6 18",
  chev:      "M9 6l6 6-6 6",
  dot:       "M12 12.01",
  bolt:      "M13 3 4 14h7l-1 7 9-11h-7l1-7z",
  filter:    "M3 5h18M6 12h12M10 19h4",
  link:      "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  copy:      "M9 9h11v11H9zM5 15V5h10",
  user:      "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

// ---------- Status / tone palette ----------
const TONE = {
  neutral: { bg: "rgba(113,113,122,.16)", fg: "#e4e4e7", bd: "rgba(113,113,122,.4)" },
  info:    { bg: "rgba(56,139,253,.12)",  fg: "#7cc4ff", bd: "rgba(56,139,253,.4)"  },
  warn:    { bg: "rgba(245,158,11,.12)",  fg: "#fbbf24", bd: "rgba(245,158,11,.4)"  },
  danger:  { bg: "rgba(239,68,68,.12)",   fg: "#fca5a5", bd: "rgba(239,68,68,.45)"  },
  ok:      { bg: "rgba(34,197,94,.12)",   fg: "#86efac", bd: "rgba(34,197,94,.4)"   },
};

// Stage chrome — non-prod / prod1 / prod2 are visually distinct
const STAGE = {
  "non-prod": { label: "non-prod", short: "NP", color: "#a78bfa", soft: "rgba(167,139,250,.15)", border: "rgba(167,139,250,.55)" },
  "prod1":    { label: "prod1 · Frankfurt", short: "P1", color: "#5eead4", soft: "rgba(94,234,212,.12)", border: "rgba(94,234,212,.5)" },
  "prod2":    { label: "prod2 · Zeus",      short: "P2", color: "#fbbf24", soft: "rgba(251,191,36,.12)", border: "rgba(251,191,36,.5)" },
};

const Badge = ({ tone = "neutral", children, dot = false, mono = false }) => {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span className="rr-badge" style={{ background: t.bg, color: t.fg, borderColor: t.bd, fontFamily: mono ? "var(--mono)" : "inherit" }}>
      {dot && <span className="rr-badge-dot" style={{ background: t.fg }} />}
      {children}
    </span>
  );
};

const Avatar = ({ id, size = 22, ring = false }) => {
  const a = window.getActor(id);
  if (!a) return null;
  return (
    <div className="rr-avatar" title={a.name + (a.role === "admin" ? " (admin)" : " (readonly)")}
         style={{
           width: size, height: size,
           background: `linear-gradient(135deg, hsl(${a.hue} 60% 38%), hsl(${a.hue} 60% 24%))`,
           boxShadow: ring ? `0 0 0 2px #0a0a0c, 0 0 0 3px hsl(${a.hue} 60% 45%)` : "inset 0 0 0 1px rgba(255,255,255,.08)",
           fontSize: size * 0.42,
         }}>
      {a.initials}
    </div>
  );
};

const AvatarStack = ({ ids, size = 22 }) => (
  <div className="rr-avstack" style={{ "--sz": size + "px" }}>
    {ids.map(id => <Avatar key={id} id={id} size={size} />)}
  </div>
);

// ---------- Sidebar ----------
const NAV = [
  { id: "timeline", label: "Timeline",       icon: ICONS.timeline },
  { id: "active",   label: "Active Rollouts",icon: ICONS.rollout  },
  { id: "locks",    label: "Locks",          icon: ICONS.lock,    badge: 3 },
  { id: "data",     label: "Master Data",    icon: ICONS.data     },
  { id: "actors",   label: "Actors",         icon: ICONS.people   },
];

const Sidebar = ({ active, onNav, onCreateRollout, onCreateLock }) => (
  <aside className="rr-sidebar">
    <div className="rr-brand">
      <div className="rr-brand-mark">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6.5" opacity=".55" />
          <circle cx="12" cy="12" r="11"  opacity=".25" />
          <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
        </svg>
      </div>
      <div>
        <div className="rr-brand-name">ReleaseRadar</div>
        <div className="rr-brand-sub">tms-platform · prod</div>
      </div>
    </div>

    <div className="rr-cta-row">
      <button className="rr-btn rr-btn-primary" onClick={onCreateRollout}>
        <Icon d={ICONS.plus} size={14} /> New rollout
      </button>
      <button className="rr-btn rr-btn-ghost" onClick={onCreateLock} title="Create lock">
        <Icon d={ICONS.lock} size={14} />
      </button>
    </div>

    <nav className="rr-nav">
      {NAV.map(n => (
        <button key={n.id}
                className={"rr-nav-item " + (active === n.id ? "is-active" : "")}
                onClick={() => onNav(n.id)}>
          <Icon d={n.icon} size={15} />
          <span>{n.label}</span>
          {n.badge && <span className="rr-nav-badge">{n.badge}</span>}
        </button>
      ))}
    </nav>

    <div className="rr-side-section">
      <div className="rr-side-section-title">Filters</div>
      <div className="rr-chip-list">
        {window.PRODUCTS.map(p => (
          <button key={p.id} className="rr-chip">
            <span className="rr-chip-dot" style={{ background: productColor(p.id) }} />
            {p.name}
          </button>
        ))}
      </div>
    </div>

    <div className="rr-side-section">
      <div className="rr-side-section-title">Legend</div>
      <div className="rr-legend">
        {Object.entries(STAGE).map(([k, s]) => (
          <div key={k} className="rr-legend-row">
            <span className="rr-legend-sq" style={{ background: s.soft, borderColor: s.border, color: s.color }}>{s.short}</span>
            <span>{s.label}</span>
          </div>
        ))}
        <div className="rr-legend-row">
          <span className="rr-legend-lock" />
          <span>Rollout-Sperre</span>
        </div>
      </div>
    </div>

    <div className="rr-side-foot">
      <div className="rr-foot-row">
        <span className="rr-status-dot" /> API healthy · 11ms
      </div>
      <div className="rr-foot-row rr-foot-muted">v2.4.1 · 7d uptime</div>
    </div>
  </aside>
);

function productColor(id) {
  return ({
    operator:      "#a78bfa",
    concentrator:  "#5eead4",
    monalesy:      "#fbbf24",
    microservices: "#fb7185",
  })[id] || "#888";
}
window.productColor = productColor;

// ---------- Header ----------
const Header = ({ scope, onScope, onCreateRollout }) => (
  <header className="rr-header">
    <div className="rr-header-left">
      <div className="rr-breadcrumbs">
        <span className="rr-crumb-muted">Workspace</span>
        <Icon d={ICONS.chev} size={12} className="rr-crumb-sep" />
        <span className="rr-crumb">Release planning</span>
        <Icon d={ICONS.chev} size={12} className="rr-crumb-sep" />
        <span className="rr-crumb-active">Timeline</span>
      </div>
    </div>

    <div className="rr-header-search">
      <Icon d={ICONS.search} size={14} />
      <input placeholder="Search rollouts, brokers, tasks…" />
      <kbd>⌘K</kbd>
    </div>

    <div className="rr-header-right">
      <div className="rr-seg">
        {["Week", "2 Weeks", "3 Weeks", "Month"].map((s, i) => (
          <button key={s} className={"rr-seg-item " + (scope === i ? "is-active" : "")} onClick={() => onScope(i)}>
            {s}
          </button>
        ))}
      </div>
      <button className="rr-btn rr-btn-ghost rr-btn-sm">
        <Icon d={ICONS.cal} size={13} /> Today
      </button>
      <button className="rr-btn rr-btn-ghost rr-btn-sm">
        <Icon d={ICONS.download} size={13} /> Export Cal-DAV
      </button>
      <div className="rr-divider" />
      <div className="rr-user">
        <Avatar id="luc" size={28} ring />
        <div className="rr-user-meta">
          <div className="rr-user-name">Luc Baumann</div>
          <div className="rr-user-role"><span className="rr-role-pill">admin</span> IT-DA-EXT</div>
        </div>
      </div>
    </div>
  </header>
);

Object.assign(window, { Icon, ICONS, TONE, STAGE, Badge, Avatar, AvatarStack, Sidebar, Header });
