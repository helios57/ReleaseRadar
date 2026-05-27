// ============================================================
// ReleaseRadar — dummy data + rollout-type rules
// ============================================================

window.PRODUCTS = [
  { id: "operator",      name: "operator",       owner: "Team Athena",   brokers: ["frankfurt-01", "frankfurt-02", "zeus-01", "zeus-02"] },
  { id: "concentrator",  name: "concentrator",   owner: "Team Athena",   brokers: ["frankfurt-01", "frankfurt-02", "zeus-01", "zeus-02"] },
  { id: "monalesy",      name: "monalesy",       owner: "Team Hermes",   brokers: ["mon-eu-1", "mon-eu-2"] },
  { id: "microservices", name: "micro services", owner: "Platform Core", brokers: ["frontend", "appluser", "monitoring", "eks-info", "solace-exporter", "ca", "msg-dup"] },
];

// Rollout types — each one carries its cascade delays and inherited task list.
// Delays are in days (Mon–Fri working days are fine for a mock).
window.ROLLOUT_TYPES = [
  {
    id: "tms-ssp-nc",
    name: "tms-ssp non-critical",
    short: "non-critical",
    tone: "neutral",
    cascade: false,
    announce: "Ankündigen in TMS_PROD min. 1h vorab",
    rules: [
      "Micro-Service Rollout — kein Einfluss auf Produktion möglich",
      "Manuelle Nachkontrolle der Applikation + Logs",
    ],
    tasks: [
      "Announce in TMS_PROD (≥ 1h)",
      "Deploy to environment",
      "Manual log check",
      "Confirm green metrics in Grafana",
    ],
  },
  {
    id: "tms-ssp-c",
    name: "tms-ssp critical",
    short: "critical",
    tone: "warn",
    cascade: false,
    announce: "Ankündigen in TMS_PROD min. 1d vorab",
    rules: [
      "Deployment + broker creation disabled during window",
      "Maintenance mode aktiv",
      "Rollout im Pair",
      "Run broker diff before lifting maintenance mode",
    ],
    tasks: [
      "Announce in TMS_PROD (≥ 1d)",
      "Enable Maintenance Mode",
      "Disable deployment + broker creation",
      "Deploy",
      "Run broker diff on all brokers",
      "Lift Maintenance Mode",
      "Manual log check",
    ],
  },
  {
    id: "tms-ssp-hf",
    name: "tms-ssp critical hotfix",
    short: "critical hotfix",
    tone: "danger",
    cascade: false,
    announce: "Ankündigen in TMS_PROD min. 1h vorab",
    rules: [
      "Pair review vorab um Risiko abzuschätzen",
      "via HotFix branch",
      "Maintenance mode aktiv",
      "Run broker diff vor Aufheben der Maintenance",
    ],
    tasks: [
      "Pair-review risk assessment",
      "Cut hotfix branch",
      "Announce in TMS_PROD (≥ 1h)",
      "Enable Maintenance Mode",
      "Deploy hotfix",
      "Run broker diff on all brokers",
      "Lift Maintenance Mode",
      "Manual log check",
    ],
  },
  {
    id: "concentrator-mod",
    name: "concentrator modification",
    short: "concentrator mod",
    tone: "warn",
    cascade: true,
    delayProd1Days: 7,
    delayProd2Days: 14,
    announce: "TMS_NP 1d • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
    rules: [
      "Individuelles Rollout-Drehbuch erforderlich",
      "Maintenance mode aktiv",
      "Rollout im Pair",
      "Run broker diff vor Aufheben der Maintenance",
    ],
    tasks: [
      "Announce in TMS_NP (≥ 1d) for non-prod",
      "Announce in TMS_PROD (≥ 1w) for prod1",
      "Announce in TMS_PROD (≥ 2w) for prod2",
      "Enable Maintenance Mode",
      "Apply concentrator modification",
      "Run broker diff on all brokers",
      "Lift Maintenance Mode",
      "Manual log check",
    ],
  },
  {
    id: "operator-feature",
    name: "operator feature (oracle & solace)",
    short: "operator feature",
    tone: "info",
    cascade: true,
    delayProd1Days: 7,
    delayProd2Days: 14,
    announce: "TMS_NP 1h • TMS_PROD 1w (prod1) • TMS_PROD 2w (prod2)",
    rules: [
      "Maintenance mode aktiv",
      "Rollout im Pair",
      "Run broker diff vor Aufheben der Maintenance",
    ],
    tasks: [
      "Announce in TMS_NP (≥ 1h)",
      "Announce in TMS_PROD (≥ 1w prod1, ≥ 2w prod2)",
      "Enable Maintenance Mode",
      "Deploy operator (oracle + solace)",
      "Run broker diff on all brokers",
      "Lift Maintenance Mode",
      "Manual log check",
    ],
  },
  {
    id: "operator-hf",
    name: "operator critical hotfix",
    short: "operator hotfix",
    tone: "danger",
    cascade: true,
    delayProd1Days: 1,
    delayProd2Days: 2,
    announce: "TMS_NP 1h • TMS_PROD 1d (prod1) • TMS_PROD 2d (prod2)",
    rules: [
      "via HotFix branch",
      "Maintenance mode aktiv",
      "Rollout im Pair",
    ],
    tasks: [
      "Cut hotfix branch",
      "Announce in TMS_NP (≥ 1h)",
      "Announce in TMS_PROD (≥ 1d prod1, ≥ 2d prod2)",
      "Enable Maintenance Mode",
      "Deploy hotfix",
      "Run broker diff on all brokers",
      "Lift Maintenance Mode",
      "Manual log check",
    ],
  },
  {
    id: "monalesy-feature",
    name: "monalesy feature",
    short: "monalesy feature",
    tone: "info",
    cascade: false,
    announce: "TMS_PROD 1d vorab",
    rules: [
      "SNOW change / Anmeldung beim Kunden (prod)",
      "Rollout im Pair (prod)",
    ],
    tasks: [
      "Open SNOW change",
      "Announce in TMS_PROD (≥ 1d)",
      "Customer notification",
      "Deploy monalesy",
      "Manual log check",
    ],
  },
  {
    id: "monalesy-patch",
    name: "monalesy patch",
    short: "monalesy patch",
    tone: "neutral",
    cascade: false,
    announce: "TMS_PROD 1h vorab",
    rules: [
      "SNOW change bei prod-Komponenten",
      "Rollout im Pair bei prod-Komponenten",
    ],
    tasks: [
      "Open SNOW change (if prod)",
      "Announce in TMS_PROD (≥ 1h)",
      "Deploy patch",
      "Manual log check",
    ],
  },
];

window.ACTORS = [
  { id: "luc",   name: "Luc B.",     initials: "LB", hue: 210, role: "admin"    },
  { id: "hen",   name: "Henning H.", initials: "HH", hue: 30,  role: "admin"    },
  { id: "mira",  name: "Mira K.",    initials: "MK", hue: 280, role: "admin"    },
  { id: "tomas", name: "Tomáš P.",   initials: "TP", hue: 150, role: "admin"    },
  { id: "sina",  name: "Sina W.",    initials: "SW", hue: 340, role: "readonly" },
  { id: "ravi",  name: "Ravi N.",    initials: "RN", hue: 195, role: "admin"    },
];

// Build a window of dates relative to "today" (mocked).
// We anchor "today" to a Wednesday so the week reads cleanly in screenshots.
window.TODAY = new Date(2026, 4, 27); // May 27, 2026 (Wed) — note: month is 0-indexed

window.dateKey = (d) => d.toISOString().slice(0, 10);
window.addDays = (d, n) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
};

// Rollouts. Each "cascade" rollout has 3 stages (non-prod, prod1, prod2).
// Non-cascade ones have a single stage (we still render as one pill in the non-prod lane).
// dayOffset is days from TODAY for the FIRST stage.
window.ROLLOUTS = [
  {
    id: "r-101",
    product: "operator",
    typeId: "operator-feature",
    title: "operator 24.7 — broker auth refactor",
    stages: [
      { env: "non-prod", offset: -2, time: "09:00", duration: 2, status: "done"     },
      { env: "prod1",    offset:  5, time: "10:00", duration: 2, status: "scheduled"},
      { env: "prod2",    offset: 12, time: "10:00", duration: 2, status: "scheduled"},
    ],
    pair: ["luc", "hen"],
    risks: "Deployment + broker creation disabled for ~2h. Touches oracle schema migration (rev 14).",
    descExt: "operator 24.7 rollout. Customers may observe transient broker creation latency during the maintenance window.",
    descInt: "Includes oracle migration rev 14 + solace exporter v2.3. Pair-reviewed by Luc/Henning. Rollback path: revert deploy + downgrade migration.",
    checked: [0, 1, 2, 3],
  },
  {
    id: "r-102",
    product: "concentrator",
    typeId: "concentrator-mod",
    title: "concentrator — TLS 1.3 enforcement",
    stages: [
      { env: "non-prod", offset:  1, time: "14:00", duration: 3, status: "scheduled"},
      { env: "prod1",    offset:  8, time: "10:00", duration: 3, status: "scheduled"},
      { env: "prod2",    offset: 15, time: "10:00", duration: 3, status: "scheduled"},
    ],
    pair: ["mira", "tomas"],
    risks: "Old clients on TLS 1.2 will be rejected. Customer list reviewed; 3 customers notified individually.",
    descExt: "concentrator enforces TLS 1.3 minimum. Legacy TLS 1.2 connections will be rejected after this rollout.",
    descInt: "Drehbuch: docs/runbooks/conc-tls13.md. Pre-check: openssl scan against all brokers.",
    checked: [],
  },
  {
    id: "r-103",
    product: "microservices",
    typeId: "tms-ssp-nc",
    title: "tms-ssp — frontend nav redesign",
    stages: [
      { env: "non-prod", offset:  0, time: "11:00", duration: 1, status: "active" },
    ],
    pair: ["sina"],
    risks: "Pure frontend change, feature-flagged.",
    descExt: "Updated navigation in the TMS self-service portal.",
    descInt: "Behind flag `nav-v2`. Roll-forward only — no DB changes.",
    checked: [0, 1],
  },
  {
    id: "r-104",
    product: "microservices",
    typeId: "tms-ssp-hf",
    title: "tms-ssp — auth token leak hotfix",
    stages: [
      { env: "non-prod", offset:  2, time: "08:00", duration: 1, status: "blocked" },
    ],
    pair: ["luc", "ravi"],
    risks: "⚠️ Lock Active: Bug on master (#4029). Force-push not acceptable. Rollout paused until hotfix branch is green.",
    descExt: "Security hotfix addressing token leak in appluser service.",
    descInt: "Hotfix branch: hotfix/4029-token-leak. Awaiting CI green before scheduling.",
    checked: [0],
  },
  {
    id: "r-105",
    product: "monalesy",
    typeId: "monalesy-patch",
    title: "monalesy — 12.4.2 patch",
    stages: [
      { env: "non-prod", offset:  3, time: "13:00", duration: 1, status: "scheduled" },
    ],
    pair: ["tomas"],
    risks: "Minor patch. No customer notification required (no prod components).",
    descExt: "Routine monalesy patch.",
    descInt: "Bumps libmon 2.4 → 2.4.1.",
    checked: [],
  },
  {
    id: "r-106",
    product: "operator",
    typeId: "operator-hf",
    title: "operator — solace pool leak hotfix",
    stages: [
      { env: "non-prod", offset:  4, time: "16:00", duration: 1, status: "scheduled"},
      { env: "prod1",    offset:  6, time: "10:00", duration: 1, status: "scheduled"},
      { env: "prod2",    offset:  8, time: "10:00", duration: 1, status: "scheduled"},
    ],
    pair: ["hen", "mira"],
    risks: "Connection pool exhaustion under high fan-out. Hotfix branch already reviewed.",
    descExt: "operator hotfix addressing solace connection pool exhaustion.",
    descInt: "hotfix/solace-pool-leak. Cherry-picked from main.",
    checked: [],
  },
  {
    id: "r-107",
    product: "monalesy",
    typeId: "monalesy-feature",
    title: "monalesy — multi-tenant export",
    stages: [
      { env: "non-prod", offset:  9, time: "09:30", duration: 2, status: "scheduled" },
    ],
    pair: ["ravi", "sina"],
    risks: "Customer-facing feature. SNOW change opened (CHG0094821).",
    descExt: "Adds multi-tenant export support to monalesy.",
    descInt: "Feature behind tenant flag. SNOW CHG0094821 raised.",
    checked: [],
  },
];

// Locks (Sperren). dateKeys is an array of YYYY-MM-DD strings; we expand date ranges below.
window.LOCKS_RAW = [
  {
    id: "l-1",
    title: "Berner Feiertag — Auffahrt",
    description: "Cantonal holiday (Bern). No rollouts permitted.",
    contact: "—",
    startOffset: 7,
    endOffset: 7,
    products: ["all"],
    kind: "holiday",
  },
  {
    id: "l-2",
    title: "Master Branch Bug #4029",
    description: "Auth token leak present on master. Do not deploy until hotfix branch is merged. Force-push on master is NOT permitted.",
    contact: "Luc B. — #tms-platform",
    startOffset: -1,
    endOffset:  3,
    products: ["microservices", "operator"],
    kind: "manual",
  },
  {
    id: "l-3",
    title: "Easter Friday",
    description: "Public holiday. No rollouts.",
    contact: "—",
    startOffset: 14,
    endOffset: 14,
    products: ["all"],
    kind: "holiday",
  },
];

// Friday rule: no rollouts on Fridays. We synthesize these client-side in the timeline.
window.isFriday = (d) => d.getDay() === 5;

window.getProduct = (id) => window.PRODUCTS.find(p => p.id === id);
window.getType    = (id) => window.ROLLOUT_TYPES.find(t => t.id === id);
window.getActor   = (id) => window.ACTORS.find(a => a.id === id);
