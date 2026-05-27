// ============================================================
// ReleaseRadar — Developer documentation page
// ============================================================

const DocsView = () => {
  const [section, setSection] = React.useState("overview");
  const [tab, setTab] = React.useState("rest");
  const [tokens, setTokens] = React.useState(SEED_TOKENS);
  const [generateOpen, setGenerateOpen] = React.useState(false);

  const sections = tab === "rest" ? REST_SECTIONS : tab === "mcp" ? MCP_SECTIONS : [];

  // Scroll-spy: update active section when scrolling
  const bodyRef = React.useRef(null);
  React.useEffect(() => {
    const el = bodyRef.current; if (!el) return;
    const handler = () => {
      const anchors = el.querySelectorAll("[data-section]");
      let cur = sections[0]?.id;
      anchors.forEach(a => {
        const r = a.getBoundingClientRect();
        if (r.top - el.getBoundingClientRect().top < 80) cur = a.dataset.section;
      });
      if (cur) setSection(cur);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [tab, sections]);

  // Reset section to first when switching tab
  React.useEffect(() => { setSection(sections[0].id); }, [tab]);

  const scrollTo = (id) => {
    const el = bodyRef.current?.querySelector(`[data-section="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="rr-docs">
      <div className="rr-docs-toolbar">
        <div>
          <h1 className="rr-md-title">Developers</h1>
          <p className="rr-md-sub">REST API and Model Context Protocol (MCP) integration for ReleaseRadar.</p>
        </div>
        <div className="rr-docs-toolbar-r">
          <a className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.download} size={13} /> Download OpenAPI spec</a>
          <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={() => setGenerateOpen(true)}>
            <Icon d={ICONS.link} size={13} /> Generate API token
          </button>
        </div>
      </div>

      <div className="rr-docs-tabs">
        <button className={"rr-md-tab " + (tab === "rest" ? "is-active" : "")} onClick={() => setTab("rest")}>REST API</button>
        <button className={"rr-md-tab " + (tab === "mcp"  ? "is-active" : "")} onClick={() => setTab("mcp")}>MCP Server</button>
        <button className={"rr-md-tab " + (tab === "keys" ? "is-active" : "")} onClick={() => setTab("keys")}>
          API Keys
          <span className="rr-docs-tab-badge">{tokens.filter(t => t.status === "active").length}</span>
        </button>
        <span className="rr-docs-tab-meta">
          {tab === "rest"  && "v2.4 · OpenAPI 3.1"}
          {tab === "mcp"   && "v0.3 · @modelcontextprotocol/sdk 1.6"}
          {tab === "keys"  && "Manage programmatic access"}
        </span>
      </div>

      <div className={"rr-docs-grid " + (tab === "keys" ? "is-single" : "")}>
        {tab !== "keys" && (
          <aside className="rr-docs-toc">
            <div className="rr-docs-toc-title">{tab === "rest" ? "REST endpoints" : "MCP capabilities"}</div>
            <ul>
              {sections.map(s => (
                <li key={s.id}>
                  <button
                    className={"rr-docs-toc-item " + (section === s.id ? "is-active" : "")}
                    onClick={() => scrollTo(s.id)}>
                    {s.icon && <Icon d={ICONS[s.icon]} size={11} />}
                    <span>{s.label}</span>
                  </button>
                  {s.children && (
                    <ul className="rr-docs-toc-sub">
                      {s.children.map(c => (
                        <li key={c.id}>
                          <button className="rr-docs-toc-item-sub" onClick={() => scrollTo(c.id)}>
                            {c.method && <span className={"rr-method rr-method-" + c.method.toLowerCase()}>{c.method}</span>}
                            {c.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="rr-docs-body" ref={bodyRef}>
          {tab === "rest" && <RestDocs tokens={tokens} setTokens={setTokens} onGenerate={() => setGenerateOpen(true)} />}
          {tab === "mcp"  && <McpDocs />}
          {tab === "keys" && <ApiKeysTab tokens={tokens} setTokens={setTokens} onGenerate={() => setGenerateOpen(true)} />}
        </div>
      </div>

      {generateOpen && (
        <GenerateTokenModal
          onClose={() => setGenerateOpen(false)}
          onCreate={(t) => { setTokens(prev => [t, ...prev]); }}
        />
      )}
    </div>
  );
};

// ============================================================
// Shared building blocks
// ============================================================
const DocsSection = ({ id, title, children }) => (
  <section className="rr-docs-section" data-section={id}>
    <h2 className="rr-docs-h2"><a href={"#" + id} className="rr-docs-anchor">§</a> {title}</h2>
    {children}
  </section>
);

const Endpoint = ({ id, method, path, summary, children, deprecated }) => (
  <article id={id} className="rr-endpoint" data-section={id}>
    <header className="rr-endpoint-head">
      <span className={"rr-method rr-method-" + method.toLowerCase()}>{method}</span>
      <code className="rr-endpoint-path">{path}</code>
      {deprecated && <span className="rr-endpoint-deprecated">deprecated</span>}
    </header>
    <p className="rr-endpoint-summary">{summary}</p>
    {children}
  </article>
);

const Code = ({ language = "json", children }) => (
  <pre className={"rr-code rr-code-" + language}>
    <code><Highlight language={language}>{children}</Highlight></code>
  </pre>
);

// Tiny syntax highlighter — well-enough for JSON / bash / TypeScript
const Highlight = ({ language, children }) => {
  let html = String(children).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (language === "json") {
    html = html.replace(/"([^"]+)":/g, '<span class="rr-tk-key">"$1"</span>:');
    html = html.replace(/: "([^"\n]*)"/g, ': <span class="rr-tk-str">"$1"</span>');
    html = html.replace(/\b(true|false|null)\b/g, '<span class="rr-tk-lit">$1</span>');
    html = html.replace(/(?<!"\w*)\b(-?\d+(?:\.\d+)?)\b(?!\w*")/g, '<span class="rr-tk-num">$1</span>');
  } else if (language === "bash" || language === "sh") {
    html = html.replace(/^(\$ ?)/gm, '<span class="rr-tk-prompt">$1</span>');
    html = html.replace(/\b(curl|cat|echo|export|claude|npx|node|GET|POST|PUT|PATCH|DELETE)\b/g, '<span class="rr-tk-kw">$1</span>');
    html = html.replace(/(-{1,2}[\w-]+)/g, '<span class="rr-tk-flag">$1</span>');
    html = html.replace(/('[^']*')/g, '<span class="rr-tk-str">$1</span>');
    html = html.replace(/("[^"]*")/g, '<span class="rr-tk-str">$1</span>');
  } else if (language === "ts" || language === "typescript" || language === "js") {
    html = html.replace(/\b(const|let|var|function|return|import|export|from|async|await|new|class|interface|type|if|else|for|of|in)\b/g, '<span class="rr-tk-kw">$1</span>');
    html = html.replace(/("[^"]*"|'[^']*'|`[^`]*`)/g, '<span class="rr-tk-str">$1</span>');
    html = html.replace(/\b(true|false|null|undefined)\b/g, '<span class="rr-tk-lit">$1</span>');
    html = html.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="rr-tk-num">$1</span>');
    html = html.replace(/(\/\/[^\n]*)/g, '<span class="rr-tk-com">$1</span>');
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const Table = ({ cols, rows }) => (
  <table className="rr-docs-table">
    <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          {r.map((cell, j) => <td key={j}>{cell}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
);

// ============================================================
// REST API content
// ============================================================
const SEED_TOKENS = [
  {
    id: "tok_01HZ5K8X",
    name: "GitLab CI — operator deploy",
    prefix: "rr_pat_a8sd",
    scopes: ["rollouts.read", "rollouts.execute", "masterdata.read"],
    createdBy: "luc",
    createdAt: new Date(2026, 3, 4, 14, 30),
    lastUsedAt: new Date(2026, 4, 27, 9, 12),
    expiresAt: new Date(2026, 9, 4),
    status: "active",
    ipAllowlist: ["10.42.0.0/16"],
  },
  {
    id: "tok_01HZ5K8Y",
    name: "Claude Desktop — Mira",
    prefix: "rr_pat_x21q",
    scopes: ["rollouts.read", "masterdata.read"],
    createdBy: "mira",
    createdAt: new Date(2026, 4, 12, 10, 0),
    lastUsedAt: new Date(2026, 4, 26, 17, 48),
    expiresAt: null,
    status: "active",
    ipAllowlist: [],
  },
  {
    id: "tok_01HZ5K8Z",
    name: "Calendar subscription — Henning",
    prefix: "rr_cal_p9mn",
    scopes: ["calendar.read"],
    createdBy: "hen",
    createdAt: new Date(2026, 1, 18, 9, 0),
    lastUsedAt: new Date(2026, 4, 27, 6, 30),
    expiresAt: null,
    status: "active",
    ipAllowlist: [],
  },
  {
    id: "tok_01HZ5K90",
    name: "Old GitLab CI (rotated)",
    prefix: "rr_pat_qq22",
    scopes: ["rollouts.read", "rollouts.execute"],
    createdBy: "luc",
    createdAt: new Date(2025, 11, 1),
    lastUsedAt: new Date(2026, 3, 3),
    expiresAt: null,
    status: "revoked",
    revokedAt: new Date(2026, 3, 4),
    ipAllowlist: [],
  },
];

const ALL_SCOPES = [
  { id: "rollouts.read",      label: "List & read rollouts" },
  { id: "rollouts.write",     label: "Create, patch, delete rollouts" },
  { id: "rollouts.execute",   label: "Execute stages, mark tasks, reschedule" },
  { id: "masterdata.read",    label: "List products / stages / types / channels / actors" },
  { id: "masterdata.write",   label: "Edit master data" },
  { id: "locks.manage",       label: "Create and lift locks" },
  { id: "locks.bypass",       label: "Force-execute through an active lock" },
  { id: "calendar.read",      label: "Subscribe to iCalendar feed" },
  { id: "webhooks.manage",    label: "Register & manage webhooks" },
];

const REST_SECTIONS = [
  { id: "overview",  label: "Overview", icon: "bolt" },
  { id: "auth",      label: "Authentication", icon: "lock" },
  { id: "tokens",    label: "API tokens", icon: "lock" },
  { id: "errors",    label: "Errors & rate limits" },
  { id: "rollouts",  label: "Rollouts",
    children: [
      { id: "ep-list-rollouts",      method: "GET",    label: "/rollouts" },
      { id: "ep-create-rollout",     method: "POST",   label: "/rollouts" },
      { id: "ep-get-rollout",        method: "GET",    label: "/rollouts/{id}" },
      { id: "ep-update-rollout",     method: "PATCH",  label: "/rollouts/{id}" },
      { id: "ep-delete-rollout",     method: "DELETE", label: "/rollouts/{id}" },
      { id: "ep-execute-stage",      method: "POST",   label: "/{id}/stages/{idx}/execute" },
      { id: "ep-fail-task",          method: "POST",   label: "/{id}/tasks/{idx}/fail" },
      { id: "ep-reschedule",         method: "POST",   label: "/{id}/reschedule" },
    ] },
  { id: "masterdata", label: "Master data",
    children: [
      { id: "ep-products",  method: "GET",  label: "/products" },
      { id: "ep-stages",    method: "GET",  label: "/stages" },
      { id: "ep-types",     method: "GET",  label: "/rollout-types" },
      { id: "ep-channels",  method: "GET",  label: "/channels" },
      { id: "ep-actors",    method: "GET",  label: "/actors" },
      { id: "ep-locks",     method: "GET",  label: "/locks" },
    ] },
  { id: "announcements", label: "Announcements" },
  { id: "calendar",      label: "iCalendar feed" },
  { id: "webhooks",      label: "Webhooks" },
];

const RestDocs = ({ tokens, setTokens, onGenerate }) => (
  <>
    <DocsSection id="overview" title="Overview">
      <p>
        The ReleaseRadar REST API exposes everything the UI does: rollouts, the cascading
        stage execution, master-data CRUD, announcement channels and the iCalendar feed.
      </p>
      <Table
        cols={["Property", "Value"]}
        rows={[
          ["Base URL",     <code>https://releaseradar.tms-platform.example/api/v2</code>],
          ["Content type", <code>application/json; charset=utf-8</code>],
          ["Encoding",     "UTF-8"],
          ["Auth",         "OAuth2 bearer (see below)"],
          ["Stability",    <span className="rr-stable">stable</span>],
          ["OpenAPI spec", <code>/api/v2/openapi.json</code>],
        ]}
      />

      <h4 className="rr-docs-h4">A quick example</h4>
      <Code language="bash">{`$ curl -H "Authorization: Bearer $RR_TOKEN" \\
       https://releaseradar.tms-platform.example/api/v2/rollouts?status=scheduled&limit=5`}</Code>
    </DocsSection>

    <DocsSection id="auth" title="Authentication">
      <p>
        All endpoints require an OAuth2 bearer token. Tokens can be issued from
        the workspace settings (per-actor, scoped, revocable).
      </p>
      <Code language="bash">{`$ export RR_TOKEN="rr_pat_a8sd9f...zZ"
$ curl -H "Authorization: Bearer $RR_TOKEN" /api/v2/rollouts`}</Code>
      <Table
        cols={["Scope", "Grants"]}
        rows={[
          ["rollouts.read",     "list, get rollouts"],
          ["rollouts.write",    "create, patch, delete rollouts"],
          ["rollouts.execute",  "execute stages, mark tasks, reschedule"],
          ["masterdata.read",   "list products/stages/types/channels/actors"],
          ["masterdata.write",  "edit master data"],
          ["webhooks.manage",   "register webhooks"],
        ]}
      />
    </DocsSection>

    <DocsSection id="tokens" title="API tokens">
      <p>
        Tokens grant programmatic access to the API. See the dedicated{" "}
        <strong>API Keys</strong> tab above for the full list, generation, and revocation.
      </p>
    </DocsSection>

    <DocsSection id="errors" title="Errors & rate limits">
      <p>Errors are returned as RFC 7807 problem documents.</p>
      <Code language="json">{`{
  "type": "https://releaseradar.example/errors/lock-active",
  "title": "Rollout cannot be executed",
  "status": 409,
  "detail": "Master branch is locked by lock-id l-2 until 2026-05-30T08:00:00Z.",
  "lockId": "l-2",
  "rolloutId": "r-104"
}`}</Code>
      <p>
        Rate limit: <code>60 req/min</code> per token, returned in <code>X-RateLimit-Remaining</code>.
        Bursts are softened via a leaky bucket of 120.
      </p>
    </DocsSection>

    <DocsSection id="rollouts" title="Rollouts">
      <p>Rollouts are the central resource. Each one has an ordered list of stages
         (its cascade) and a checklist inherited from its <code>rolloutTypeId</code>.</p>

      <Endpoint id="ep-list-rollouts" method="GET" path="/rollouts"
        summary="List rollouts. Filter by product, type, status, actor, or date range.">
        <h4 className="rr-docs-h4">Query parameters</h4>
        <Table cols={["Param", "Type", "Notes"]} rows={[
          ["product",  "string[]", "filter by product key"],
          ["type",     "string[]", "filter by rolloutTypeId"],
          ["status",   "string[]", <>any of <code>scheduled</code>, <code>active</code>, <code>done</code>, <code>failed</code>, <code>blocked</code></>],
          ["actor",    "string[]", "actor in the execution pair"],
          ["from",     "ISO 8601", "stage start ≥ this"],
          ["to",       "ISO 8601", "stage start ≤ this"],
          ["limit",    "int",      "default 50, max 200"],
          ["cursor",   "string",   "opaque cursor (pagination)"],
        ]}/>
        <h4 className="rr-docs-h4">Response</h4>
        <Code language="json">{`{
  "data": [
    {
      "id": "r-101",
      "title": "operator 24.7 — broker auth refactor",
      "productId": "operator",
      "rolloutTypeId": "operator-feature",
      "stages": [
        { "stageKey": "non-prod", "scheduledAt": "2026-05-25T09:00:00Z", "durationHours": 2, "status": "done" },
        { "stageKey": "prod1",    "scheduledAt": "2026-06-01T10:00:00Z", "durationHours": 2, "status": "scheduled" },
        { "stageKey": "prod2",    "scheduledAt": "2026-06-08T10:00:00Z", "durationHours": 2, "status": "scheduled" }
      ],
      "pair": ["luc", "hen"],
      "descExt": "operator 24.7 rollout. Customers may observe transient broker creation latency…",
      "announcementText": "operator 24.7 rollout — short maintenance window expected.",
      "risks": "Deployment + broker creation disabled for ~2h.",
      "links": { "self": "/rollouts/r-101", "ics": "/rollouts/r-101/ics" }
    }
  ],
  "nextCursor": "eyJvZmZzZXQiOjUwfQ=="
}`}</Code>
      </Endpoint>

      <Endpoint id="ep-create-rollout" method="POST" path="/rollouts"
        summary="Create a rollout. The cascade is materialized from the rollout type's cascadePlan.">
        <h4 className="rr-docs-h4">Request body</h4>
        <Code language="json">{`{
  "productId": "operator",
  "rolloutTypeId": "operator-feature",
  "startAt": "2026-06-15T10:00:00Z",
  "pair": ["luc", "hen"],
  "title": "operator 24.8 — solace tls",
  "descExt": "operator 24.8 rollout.",
  "descInt": "Internal notes…",
  "announcementText": "Optional override — falls back to descExt if empty.",
  "risks": "Connection blip during certificate hot-reload."
}`}</Code>
        <p>Returns <span className="rr-stable">201 Created</span> with the materialized rollout including computed stage timestamps.</p>
      </Endpoint>

      <Endpoint id="ep-get-rollout" method="GET" path="/rollouts/{id}" summary="Fetch a single rollout with stages and tasks." />

      <Endpoint id="ep-update-rollout" method="PATCH" path="/rollouts/{id}"
        summary="Patch descriptions, announcementText, risks, or the pair. Stage times require /reschedule.">
        <Code language="json">{`{ "announcementText": "Customer-friendly summary updated 2 days before prod1." }`}</Code>
      </Endpoint>

      <Endpoint id="ep-delete-rollout" method="DELETE" path="/rollouts/{id}" summary="Cancel a rollout (only allowed while all stages are scheduled or blocked)." />

      <Endpoint id="ep-execute-stage" method="POST" path="/rollouts/{id}/stages/{idx}/execute"
        summary="Mark a stage as active and start its checklist clock. Pair confirmation required.">
        <Code language="json">{`{ "confirmedBy": ["luc", "hen"], "force": false }`}</Code>
        <p>
          Returns <span className="rr-stable">409 Conflict</span> with a problem document if a
          lock overlaps the stage window. Pass <code>force: true</code> only if your token has
          <code>locks.bypass</code> scope.
        </p>
      </Endpoint>

      <Endpoint id="ep-fail-task" method="POST" path="/rollouts/{id}/tasks/{idx}/fail"
        summary="Mark a task as failed with a required reason.">
        <Code language="json">{`{ "reason": "broker diff returned 14 unexpected drift entries on zeus-02 — investigate.", "by": "luc" }`}</Code>
      </Endpoint>

      <Endpoint id="ep-reschedule" method="POST" path="/rollouts/{id}/reschedule"
        summary="Mark the rollout failed and create a copy scheduled for a new start.">
        <Code language="json">{`{ "newStartAt": "2026-06-22T10:00:00Z", "addContext": "retry after broker cleanup on zeus-02" }`}</Code>
        <p>Response includes the new rollout id and a back-link to the failed original.</p>
      </Endpoint>
    </DocsSection>

    <DocsSection id="masterdata" title="Master data">
      <p>All master-data resources expose the same shape: <code>GET /{`{resource}`}</code> for
         a paginated list, <code>POST /{`{resource}`}</code> to create, <code>PATCH</code> and
         <code>DELETE</code> on the item URL. Below: just the example responses.</p>

      <Endpoint id="ep-products" method="GET" path="/products" summary="Products owned by this workspace.">
        <Code language="json">{`{
  "data": [
    {
      "id": "operator",
      "name": "operator",
      "owner": "Team Athena",
      "color": "#a78bfa",
      "brokers": ["frankfurt-01", "frankfurt-02", "zeus-01", "zeus-02"],
      "allowedRolloutTypes": ["operator-feature", "operator-hf"],
      "defaultPair": ["luc", "hen"]
    }
  ]
}`}</Code>
      </Endpoint>

      <Endpoint id="ep-stages" method="GET" path="/stages" summary="Deployment stages (non-prod, prod1…). Reorder via PATCH with an `order` field.">
        <Code language="json">{`{
  "data": [
    {
      "key": "prod1",
      "label": "prod1 · Frankfurt",
      "short": "P1",
      "region": "Frankfurt-am-Main",
      "color": "#5eead4",
      "requiresPair": true,
      "announceChannelKey": "TMS_PROD",
      "minAdvanceHours": 168,
      "order": 1,
      "enabled": true
    }
  ]
}`}</Code>
      </Endpoint>

      <Endpoint id="ep-types" method="GET" path="/rollout-types" summary="Rollout types and their cascadePlan.">
        <Code language="json">{`{
  "id": "operator-feature",
  "name": "operator feature (oracle & solace)",
  "short": "operator feature",
  "tone": "info",
  "cascadePlan": [
    { "stageKey": "non-prod", "delayHours": 0 },
    { "stageKey": "prod1",    "delayHours": 168 },
    { "stageKey": "prod2",    "delayHours": 336 }
  ],
  "rules": ["Maintenance mode active", "Rollout im Pair", "Run broker diff before lifting maintenance"],
  "tasks": ["Announce in TMS_NP (≥ 1h)", "Deploy operator", "Run broker diff on all brokers", "Manual log check"]
}`}</Code>
        <p>The <code>announce</code> policy is derived from the cascade plan and the referenced stages — it is not stored.</p>
      </Endpoint>

      <Endpoint id="ep-channels" method="GET" path="/channels" summary="Announcement channels and their integration configs.">
        <Code language="json">{`{
  "id": "ch-2",
  "key": "TMS_PROD",
  "name": "TMS Production Announcements",
  "kind": "teams",
  "integration": {
    "tenantId":  "8d5b1a2c-...",
    "teamId":    "19:c9d4@thread.tacv2",
    "channelId": "tms-prod-deploys",
    "webhookUrl": "<encrypted at rest>",
    "mentions":  ["@tms-platform", "@customer-success"],
    "retry":     { "maxAttempts": 5, "strategy": "exponential", "initialDelaySec": 10, "alertOnFinalFail": true, "dedupeMin": 60 }
  },
  "template": "📦 **{{rollout.title}}** — {{type.short}}\\n\\nProduct: {{product.name}}\\n…",
  "minAdvanceHours": 168,
  "sendOn": ["scheduled", "active", "done", "failed"],
  "quietHours": { "enabled": true, "from": "20:00", "to": "06:00" }
}`}</Code>
      </Endpoint>

      <Endpoint id="ep-actors" method="GET" path="/actors" summary="People who can execute rollouts. Read-only — actors are synced from IdP." />

      <Endpoint id="ep-locks"  method="GET" path="/locks"  summary="Active and upcoming rollout-Sperren." />
    </DocsSection>

    <DocsSection id="announcements" title="Announcements">
      <p>
        Channels are triggered automatically by stage state transitions (per the channel's
        <code>sendOn</code> list). You can also send announcements imperatively:
      </p>
      <Endpoint id="ep-announce-preview" method="POST" path="/rollouts/{id}/announcements:preview"
        summary="Render the announcement template against a rollout — does not send.">
        <Code language="json">{`{ "channelKey": "TMS_PROD", "stageIdx": 1 }`}</Code>
        <p>Returns <code>{`{ "text": "...", "missingVariables": [], "warnings": [] }`}</code>.</p>
      </Endpoint>
      <Endpoint id="ep-announce-send" method="POST" path="/rollouts/{id}/announcements:send"
        summary="Send the rendered announcement. Throttled by the channel's dedupe window." />
    </DocsSection>

    <DocsSection id="calendar" title="iCalendar feed">
      <p>
        Each user gets a private Cal-DAV URL via <code>/calendar.ics?token=…</code>.
        Personal subscriptions only include the rollouts that match the user's saved filters.
      </p>
      <Code language="bash">{`$ curl -L https://releaseradar.tms-platform.example/calendar.ics?token=$RR_CAL_TOKEN > tms.ics`}</Code>
    </DocsSection>

    <DocsSection id="webhooks" title="Webhooks">
      <p>Subscribe to system events. Payloads are signed with HMAC-SHA256 (<code>X-RR-Signature</code> header).</p>
      <Table cols={["Event", "Payload top-level"]} rows={[
        ["rollout.created",      <code>rollout</code>],
        ["rollout.updated",      <code>rollout, changes[]</code>],
        ["rollout.stage.executed", <code>rollout, stage, executor</code>],
        ["rollout.task.failed",  <code>rollout, taskIdx, reason, by</code>],
        ["rollout.rescheduled",  <code>oldRollout, newRollout</code>],
        ["lock.created",         <code>lock</code>],
        ["channel.failed",       <code>channelKey, attempts[], lastError</code>],
      ]}/>
    </DocsSection>
  </>
);

// ============================================================
// MCP server content
// ============================================================
const MCP_SECTIONS = [
  { id: "mcp-overview",  label: "What is MCP?",      icon: "bolt" },
  { id: "mcp-install",   label: "Install & connect", icon: "download" },
  { id: "mcp-tools",     label: "Tools",
    children: [
      { id: "tool-list-rollouts",    label: "list_rollouts" },
      { id: "tool-get-rollout",      label: "get_rollout" },
      { id: "tool-create-rollout",   label: "create_rollout" },
      { id: "tool-execute-stage",    label: "execute_stage" },
      { id: "tool-fail-task",        label: "fail_task" },
      { id: "tool-reschedule",       label: "reschedule_rollout" },
      { id: "tool-announce-preview", label: "preview_announcement" },
      { id: "tool-create-lock",      label: "create_lock" },
    ] },
  { id: "mcp-resources",  label: "Resources" },
  { id: "mcp-prompts",    label: "Prompts" },
  { id: "mcp-auth",       label: "Auth & scopes" },
  { id: "mcp-claude",     label: "Use with Claude Desktop" },
];

const McpDocs = () => (
  <>
    <DocsSection id="mcp-overview" title="What is MCP?">
      <p>
        The Model Context Protocol (MCP) lets AI assistants like Claude talk to ReleaseRadar
        as a first-class data source. Our MCP server exposes the same operations as the REST API,
        plus typed <strong>resources</strong> the assistant can read and structured
        <strong> prompts</strong> for common workflows.
      </p>
      <div className="rr-callout">
        <Icon d={ICONS.bolt} size={14} />
        <div>
          <strong>Why use it?</strong>{" "}
          Instead of pasting endpoints into your agent's tool list, point Claude at one MCP
          server and it discovers everything: cascade planning, rollout creation, lock
          inspection, announcement previews. The assistant always has up-to-date context
          about what's currently scheduled.
        </div>
      </div>
    </DocsSection>

    <DocsSection id="mcp-install" title="Install & connect">
      <p>The server ships as both an npm package (stdio transport for local agents) and an HTTP/SSE endpoint.</p>

      <h4 className="rr-docs-h4">Option A — stdio (Claude Desktop, local IDEs)</h4>
      <Code language="bash">{`$ npx -y @tms-platform/releaseradar-mcp@latest --token $RR_TOKEN`}</Code>

      <h4 className="rr-docs-h4">Option B — HTTP/SSE (remote agents)</h4>
      <Code language="bash">{`$ curl -N -H "Authorization: Bearer $RR_TOKEN" \\
       https://releaseradar.tms-platform.example/mcp/sse`}</Code>

      <h4 className="rr-docs-h4">Handshake</h4>
      <Code language="json">{`{
  "name": "releaseradar",
  "version": "0.3.1",
  "protocolVersion": "2025-03-26",
  "capabilities": {
    "tools":     { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true },
    "prompts":   {}
  }
}`}</Code>
    </DocsSection>

    <DocsSection id="mcp-tools" title="Tools">
      <p>Every tool returns structured JSON. Errors follow the same RFC-7807 shape as the REST API.</p>

      <McpTool id="tool-list-rollouts" name="list_rollouts" desc="List rollouts with optional filters. Wraps GET /rollouts."
        schema={`{
  "type": "object",
  "properties": {
    "products":  { "type": "array", "items": { "type": "string" } },
    "types":     { "type": "array", "items": { "type": "string" } },
    "statuses":  { "type": "array", "items": { "enum": ["scheduled","active","done","failed","blocked"] } },
    "from":      { "type": "string", "format": "date-time" },
    "to":        { "type": "string", "format": "date-time" },
    "limit":     { "type": "integer", "default": 25, "maximum": 200 }
  }
}`} />

      <McpTool id="tool-get-rollout" name="get_rollout" desc="Fetch a rollout by id with its full stage & task state."
        schema={`{ "type": "object", "required": ["id"], "properties": { "id": { "type": "string" } } }`} />

      <McpTool id="tool-create-rollout" name="create_rollout" desc="Create a new rollout. The cascade is auto-materialized from the chosen rollout type."
        schema={`{
  "type": "object",
  "required": ["productId", "rolloutTypeId", "startAt", "title"],
  "properties": {
    "productId":        { "type": "string" },
    "rolloutTypeId":    { "type": "string" },
    "startAt":          { "type": "string", "format": "date-time" },
    "pair":             { "type": "array", "items": { "type": "string" }, "maxItems": 2 },
    "title":            { "type": "string" },
    "descExt":          { "type": "string" },
    "descInt":          { "type": "string" },
    "announcementText": { "type": "string" },
    "risks":            { "type": "string" }
  }
}`} />

      <McpTool id="tool-execute-stage" name="execute_stage" desc="Execute the next stage in a rollout's cascade. Refuses if a lock overlaps the window."
        schema={`{
  "type": "object",
  "required": ["rolloutId", "stageIdx"],
  "properties": {
    "rolloutId":     { "type": "string" },
    "stageIdx":      { "type": "integer" },
    "confirmedBy":   { "type": "array", "items": { "type": "string" } }
  }
}`} />

      <McpTool id="tool-fail-task" name="fail_task" desc="Record a task failure with a required reason."
        schema={`{
  "type": "object",
  "required": ["rolloutId", "taskIdx", "reason", "by"],
  "properties": {
    "rolloutId": { "type": "string" },
    "taskIdx":   { "type": "integer" },
    "reason":    { "type": "string", "minLength": 4 },
    "by":        { "type": "string" }
  }
}`} />

      <McpTool id="tool-reschedule" name="reschedule_rollout" desc="Mark a rollout failed and create a copy at a new time."
        schema={`{ "type": "object", "required": ["id", "newStartAt"], "properties": { "id": { "type": "string" }, "newStartAt": { "type": "string", "format": "date-time" }, "addContext": { "type": "string" } } }`} />

      <McpTool id="tool-announce-preview" name="preview_announcement" desc="Render the announcement template for a stage. Read-only — never sends."
        schema={`{ "type": "object", "required": ["rolloutId", "stageIdx"], "properties": { "rolloutId": { "type": "string" }, "stageIdx": { "type": "integer" }, "channelKey": { "type": "string" } } }`} />

      <McpTool id="tool-create-lock" name="create_lock" desc="Create a rollout-Sperre. Useful when an agent detects a master-bug from CI logs."
        schema={`{
  "type": "object",
  "required": ["title", "kind", "startAt", "endAt"],
  "properties": {
    "title":       { "type": "string" },
    "description": { "type": "string" },
    "contact":     { "type": "string" },
    "kind":        { "enum": ["manual", "holiday", "window"] },
    "startAt":     { "type": "string", "format": "date-time" },
    "endAt":       { "type": "string", "format": "date-time" },
    "products":    { "type": "array", "items": { "type": "string" } }
  }
}`} />
    </DocsSection>

    <DocsSection id="mcp-resources" title="Resources">
      <p>
        Resources are read-only context the assistant can pull on demand.
        Subscribe and the server pushes <code>resources/updated</code> notifications when
        anything changes.
      </p>
      <Table cols={["URI scheme", "Returns"]} rows={[
        [<code>rollout://&#123;id&#125;</code>,         "JSON rollout, including stage and task state"],
        [<code>rollout://&#123;id&#125;/announcement</code>, "Rendered customer announcement (text/markdown)"],
        [<code>product://&#123;id&#125;</code>,         "Product master record + broker list"],
        [<code>stage://&#123;key&#125;</code>,          "Stage definition (color, channel, advance hours)"],
        [<code>type://&#123;id&#125;</code>,            "Rollout type with cascadePlan, rules, tasks"],
        [<code>lock://&#123;id&#125;</code>,            "Lock detail"],
        [<code>calendar://upcoming</code>,            "Next 30 days as iCalendar VEVENTs"],
      ]}/>
    </DocsSection>

    <DocsSection id="mcp-prompts" title="Prompts">
      <p>Pre-baked instructions for common workflows. Selectable from the assistant's prompt picker.</p>

      <Table cols={["Name", "Inputs", "What it does"]} rows={[
        ["cascade_planner",
          "product, change_summary",
          "Picks an appropriate rollout type, proposes start time avoiding locks and weekends, returns a create_rollout payload."],
        ["incident_lockdown",
          "trigger (e.g. CI failure)",
          "Drafts a lock (title, description, affected products) ready to confirm with create_lock."],
        ["customer_summary",
          "rollout_id",
          "Reads the rollout + announcement template, writes a customer-friendly digest."],
        ["weekly_changelog",
          "from, to",
          "Summarizes all completed rollouts for a stakeholder update."],
      ]}/>
    </DocsSection>

    <DocsSection id="mcp-auth" title="Auth & scopes">
      <p>The MCP server uses the same OAuth2 tokens as the REST API; scopes are honored 1:1.</p>
      <Code language="bash">{`$ export RR_TOKEN="rr_pat_..."
$ npx @tms-platform/releaseradar-mcp --token $RR_TOKEN \\
                                    --scopes rollouts.read,rollouts.execute,masterdata.read`}</Code>
      <p>
        Tool calls that exceed your token's scopes return a structured error the assistant
        is trained to interpret — it will surface "needs additional scope: …" to the user
        instead of failing silently.
      </p>
    </DocsSection>

    <DocsSection id="mcp-claude" title="Use with Claude Desktop">
      <p>Add the MCP server to your <code>claude_desktop_config.json</code>:</p>
      <Code language="json">{`{
  "mcpServers": {
    "releaseradar": {
      "command": "npx",
      "args": ["-y", "@tms-platform/releaseradar-mcp@latest"],
      "env": {
        "RR_TOKEN": "rr_pat_a8sd9f...zZ"
      }
    }
  }
}`}</Code>
      <p>
        Restart Claude Desktop; the radar icon appears in the composer and "Use cascade_planner"
        becomes available as a prompt. The assistant will list rollouts, suggest types,
        avoid lock windows and ask for confirmation before any write.
      </p>
      <div className="rr-callout">
        <Icon d={ICONS.warn} size={14} />
        <div>
          <strong>Write operations are confirmation-gated.</strong>{" "}
          The server requires an <code>X-MCP-Confirm: yes</code> header for any tool that
          would mutate state. The Claude Desktop adapter handles this via the user-prompted
          tool-permissions dialog — there is no way for the assistant to silently execute
          a stage or reschedule a rollout.
        </div>
      </div>
    </DocsSection>
  </>
);

// ============================================================
// API Keys tab — standalone management view
// ============================================================
const ApiKeysTab = ({ tokens, setTokens, onGenerate }) => {
  const [query, setQuery] = React.useState("");

  const filtered = tokens.filter(t => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q)
        || t.id.toLowerCase().includes(q)
        || t.prefix.toLowerCase().includes(q)
        || t.scopes.some(s => s.toLowerCase().includes(q));
  });

  const stats = {
    active:    tokens.filter(t => t.status === "active").length,
    revoked:   tokens.filter(t => t.status === "revoked").length,
    expiring:  tokens.filter(t => t.status === "active" && t.expiresAt && (t.expiresAt - window.TODAY) / 86400000 < 30).length,
    unused30d: tokens.filter(t => t.status === "active" && (!t.lastUsedAt || (window.TODAY - t.lastUsedAt) / 86400000 > 30)).length,
  };

  return (
    <div className="rr-keys-page">
      <div className="rr-keys-stats">
        <div className="rr-keys-stat">
          <div className="rr-keys-stat-label">Active keys</div>
          <div className="rr-keys-stat-value" style={{ color: "#86efac" }}>{stats.active}</div>
        </div>
        <div className="rr-keys-stat">
          <div className="rr-keys-stat-label">Expiring &lt; 30d</div>
          <div className="rr-keys-stat-value" style={{ color: stats.expiring > 0 ? "#fbbf24" : "var(--muted)" }}>{stats.expiring}</div>
        </div>
        <div className="rr-keys-stat">
          <div className="rr-keys-stat-label">Idle &gt; 30d</div>
          <div className="rr-keys-stat-value" style={{ color: stats.unused30d > 0 ? "#fbbf24" : "var(--muted)" }}>{stats.unused30d}</div>
        </div>
        <div className="rr-keys-stat">
          <div className="rr-keys-stat-label">Revoked</div>
          <div className="rr-keys-stat-value rr-mono" style={{ color: "var(--muted)" }}>{stats.revoked}</div>
        </div>
      </div>

      <div className="rr-keys-search-row">
        <div className="rr-header-search rr-keys-search">
          <Icon d={ICONS.search} size={13} />
          <input
            placeholder="Filter by name, id, prefix, or scope…"
            value={query}
            onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onGenerate}>
          <Icon d={ICONS.plus} size={13} /> Generate new key
        </button>
      </div>

      <div className="rr-keys-callout">
        <Icon d={ICONS.lock} size={14} />
        <div>
          API keys carry the scopes of the user who created them and act as that user
          for audit logging. <strong>Revoke immediately</strong> if a key leaves a trusted
          environment — there is no way to recover the value once issued.
        </div>
      </div>

      <TokensManager tokens={filtered} setTokens={setTokens} onGenerate={onGenerate} />
    </div>
  );
};
function fmtAgo(d) {
  if (!d) return "—";
  const diff = (window.TODAY - d) / 86400000;
  if (diff < 1)  return Math.max(1, Math.round(diff * 24)) + "h ago";
  if (diff < 30) return Math.round(diff) + "d ago";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const TokensManager = ({ tokens, setTokens, onGenerate }) => {
  const [showRevoked, setShowRevoked] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState(null);

  const visible = tokens.filter(t => showRevoked || t.status === "active");
  const activeCount = tokens.filter(t => t.status === "active").length;
  const revokedCount = tokens.filter(t => t.status === "revoked").length;

  const revoke = (id) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, status: "revoked", revokedAt: new Date() } : t));
    setConfirmId(null);
  };

  return (
    <div className="rr-tokens">
      <header className="rr-tokens-head">
        <div className="rr-tokens-meta">
          <span className="rr-mono"><strong className="rr-tokens-strong">{activeCount}</strong> active</span>
          {revokedCount > 0 && (
            <span className="rr-mono">
              <strong className="rr-tokens-strong">{revokedCount}</strong> revoked
            </span>
          )}
          <label className="rr-tokens-toggle">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={e => setShowRevoked(e.target.checked)} />
            <span>Show revoked</span>
          </label>
        </div>
        <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onGenerate}>
          <Icon d={ICONS.plus} size={12} /> Generate token
        </button>
      </header>

      <ul className="rr-tokens-list">
        {visible.length === 0 && (
          <li className="rr-tokens-empty">No tokens to show.</li>
        )}
        {visible.map(t => {
          const isRevoked = t.status === "revoked";
          const expiring = t.expiresAt && (t.expiresAt - window.TODAY) / 86400000 < 30 && !isRevoked;
          return (
            <li key={t.id} className={"rr-token " + (isRevoked ? "is-revoked" : "")}>
              <div className="rr-token-l">
                <div className="rr-token-head">
                  <span className="rr-token-name">{t.name}</span>
                  {isRevoked
                    ? <Badge tone="danger">revoked</Badge>
                    : expiring
                      ? <Badge tone="warn" dot>expires {fmtAgo(t.expiresAt).replace(" ago", " from now")}</Badge>
                      : <Badge tone="ok" dot>active</Badge>}
                </div>
                <div className="rr-token-prefix">
                  <code>{t.prefix}…</code>
                  <span className="rr-token-id rr-mono rr-muted">{t.id}</span>
                </div>
                <div className="rr-token-scopes">
                  {t.scopes.map(s => <code key={s} className="rr-token-scope">{s}</code>)}
                </div>
                <div className="rr-token-meta">
                  <span>
                    <Icon d={ICONS.user} size={11} />
                    created by <Avatar id={t.createdBy} size={14} />
                    {window.getActor(t.createdBy)?.name || t.createdBy}
                  </span>
                  <span><Icon d={ICONS.cal} size={11} /> {fmtDate(t.createdAt)}</span>
                  <span>
                    <Icon d={ICONS.bolt} size={11} />
                    last used <strong>{fmtAgo(t.lastUsedAt)}</strong>
                  </span>
                  <span><Icon d={ICONS.lock} size={11} /> expires {t.expiresAt ? fmtDate(t.expiresAt) : "never"}</span>
                  {t.ipAllowlist.length > 0 && (
                    <span><Icon d={ICONS.filter} size={11} /> IP {t.ipAllowlist.join(", ")}</span>
                  )}
                  {isRevoked && (
                    <span className="rr-token-revoked-at">revoked {fmtDate(t.revokedAt)}</span>
                  )}
                </div>
              </div>
              <div className="rr-token-r">
                {!isRevoked && (
                  confirmId === t.id ? (
                    <div className="rr-token-confirm">
                      <span>Revoke this token?</span>
                      <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={() => setConfirmId(null)}>Cancel</button>
                      <button className="rr-btn rr-btn-danger rr-btn-sm" onClick={() => revoke(t.id)}>Revoke</button>
                    </div>
                  ) : (
                    <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={() => setConfirmId(t.id)}>
                      <Icon d={ICONS.x} size={12} /> Revoke
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const GenerateTokenModal = ({ onClose, onCreate }) => {
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState(["rollouts.read", "masterdata.read"]);
  const [expiry, setExpiry] = React.useState("90");
  const [ipAllow, setIpAllow] = React.useState("");
  const [created, setCreated] = React.useState(null);
  const [copied, setCopied] = React.useState(false);

  const toggleScope = (s) => {
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const generate = () => {
    if (!name.trim() || scopes.length === 0) return;
    const expiresAt = expiry === "never" ? null : window.addDays(new Date(), Number(expiry));
    const rand = () => Math.random().toString(36).slice(2, 10);
    const value = "rr_pat_" + rand() + rand() + rand() + rand();
    const token = {
      id: "tok_" + rand().toUpperCase(),
      name: name.trim(),
      prefix: value.slice(0, 12),
      scopes,
      createdBy: "luc",
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt,
      status: "active",
      ipAllowlist: ipAllow.split(",").map(s => s.trim()).filter(Boolean),
    };
    setCreated({ ...token, fullValue: value });
    onCreate(token);
  };

  const copy = () => {
    try {
      navigator.clipboard.writeText(created.fullValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  };

  return (
    <div className="rr-modal-scrim" onClick={onClose}>
      <div className="rr-modal" onClick={e => e.stopPropagation()}>
        <header className="rr-modal-head">
          <div>
            <h2>{created ? "Token created" : "Generate API token"}</h2>
            <p className="rr-modal-sub">
              {created
                ? "Copy this token now — it will not be shown again."
                : "Tokens act on your behalf. Grant the minimum scopes the integration needs."}
            </p>
          </div>
          <button className="rr-icon-btn" onClick={onClose}><Icon d={ICONS.x} size={14} /></button>
        </header>

        {created ? (
          <div className="rr-modal-body">
            <div className="rr-token-secret">
              <div className="rr-token-secret-label">Your token</div>
              <code className="rr-token-secret-value">{created.fullValue}</code>
              <button className={"rr-btn rr-btn-primary rr-btn-sm " + (copied ? "is-on-ghost" : "")} onClick={copy}>
                <Icon d={copied ? ICONS.check : ICONS.copy} size={12} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="rr-callout">
              <Icon d={ICONS.warn} size={14} />
              <div>
                <strong>This is the only time you'll see the full value.</strong>{" "}
                ReleaseRadar only stores the hash. Closing this dialog without copying means
                you'll need to generate a new token if you lose it.
              </div>
            </div>
            <h4 className="rr-docs-h4">Use it in code</h4>
            <Code language="bash">{`$ export RR_TOKEN="${created.fullValue}"
$ curl -H "Authorization: Bearer $RR_TOKEN" \\
       https://releaseradar.tms-platform.example/api/v2/rollouts`}</Code>
          </div>
        ) : (
          <div className="rr-modal-body">
            <label className="rr-field">
              <span>Name <em>(internal label — e.g. "GitLab CI — operator deploy")</em></span>
              <input
                placeholder="What is this token for?"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus />
            </label>

            <div className="rr-field">
              <span>Scopes <em>(grant only what's required)</em></span>
              <div className="rr-token-scopes-pick">
                {ALL_SCOPES.map(s => {
                  const on = scopes.includes(s.id);
                  return (
                    <button key={s.id}
                      className={"rr-token-scope-pick " + (on ? "is-on" : "")}
                      onClick={() => toggleScope(s.id)}>
                      <span className="rr-token-scope-check">
                        {on && <Icon d={ICONS.check} size={11} />}
                      </span>
                      <div>
                        <code>{s.id}</code>
                        <div className="rr-token-scope-desc">{s.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rr-form-grid">
              <label className="rr-field">
                <span>Expiry</span>
                <select value={expiry} onChange={e => setExpiry(e.target.value)}>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days (recommended)</option>
                  <option value="365">1 year</option>
                  <option value="never">Never expires</option>
                </select>
              </label>
              <label className="rr-field">
                <span>IP allow-list <em>(optional, comma-separated CIDR)</em></span>
                <input
                  placeholder="10.42.0.0/16, 192.168.1.0/24"
                  value={ipAllow}
                  onChange={e => setIpAllow(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        <footer className="rr-modal-foot">
          {created ? (
            <>
              <span className="rr-muted">Token <code>{created.id}</code> is now active.</span>
              <div className="rr-modal-foot-actions">
                <button className="rr-btn rr-btn-primary" onClick={onClose}>Done</button>
              </div>
            </>
          ) : (
            <>
              <span className="rr-muted">{scopes.length} scope{scopes.length === 1 ? "" : "s"} selected</span>
              <div className="rr-modal-foot-actions">
                <button className="rr-btn rr-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="rr-btn rr-btn-primary"
                  onClick={generate}
                  disabled={!name.trim() || scopes.length === 0}>
                  <Icon d={ICONS.bolt} size={12} /> Generate token
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

const McpTool = ({ id, name, desc, schema }) => (
  <article id={id} className="rr-mcp-tool" data-section={id}>
    <header className="rr-mcp-tool-head">
      <code className="rr-mcp-tool-name">{name}</code>
      <span className="rr-mcp-tool-kind">tool</span>
    </header>
    <p className="rr-endpoint-summary">{desc}</p>
    <details className="rr-mcp-schema">
      <summary>Input schema</summary>
      <Code language="json">{schema}</Code>
    </details>
  </article>
);

Object.assign(window, { DocsView });
