// ============================================================
// ReleaseRadar — Master Data editor (Products, Rollout Types, Actors, Locks)
// ============================================================
const { useState: mdUseState, useMemo: mdUseMemo } = React;

const MD_TABS = [
  { id: "products",  label: "Products"      },
  { id: "stages",    label: "Stages"        },
  { id: "types",     label: "Rollout Types" },
  { id: "channels",  label: "Channels"      },
  { id: "contacts",  label: "Contacts"      },
  { id: "actors",    label: "Actors"        },
  { id: "filters",   label: "Filters"       },
];

const MasterDataView = ({ initialTab = "products" }) => {
  const [tab, setTab] = mdUseState(initialTab);

  return (
    <div className="rr-md">
      <div className="rr-md-head">
        <div>
          <h1 className="rr-md-title">Master Data</h1>
          <p className="rr-md-sub">Configure products, rollout types, actors, and locks that drive the timeline and execute flow.</p>
        </div>
      </div>

      <div className="rr-md-tabs">
        {MD_TABS.map(t => (
          <button key={t.id}
                  className={"rr-md-tab " + (tab === t.id ? "is-active" : "")}
                  onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rr-md-body">
        {tab === "products" && <ProductsEditor />}
        {tab === "stages"   && <StagesEditor />}
        {tab === "types"    && <RolloutTypesEditor />}
        {tab === "channels" && <ChannelsEditor />}
        {tab === "contacts" && (
          <div className="rr-md-hosted">
            <window.ContactsCard />
          </div>
        )}
        {tab === "actors"   && <ActorsEditor />}
        {tab === "filters"  && <FiltersEditor />}
      </div>
    </div>
  );
};

// ============================================================
// Generic master/detail shell (list left, detail right)
// ============================================================
const MDMasterDetail = ({ items, selectedId, onSelect, onAdd, onRemove, renderListItem, renderDetail, addLabel = "Add", emptyLabel = "Nothing selected." }) => (
  <div className="rr-md-grid">
    <aside className="rr-md-list">
      <div className="rr-md-list-head">
        <span className="rr-md-list-count">{items.length} {items.length === 1 ? "entry" : "entries"}</span>
        <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={onAdd}>
          <Icon d={ICONS.plus} size={12} /> {addLabel}
        </button>
      </div>
      <ul className="rr-md-list-items">
        {items.map(it => (
          <li key={it.id}>
            <button className={"rr-md-list-row " + (selectedId === it.id ? "is-active" : "")}
                    onClick={() => onSelect(it.id)}>
              {renderListItem(it)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
    <section className="rr-md-detail">
      {selectedId ? renderDetail() : <div className="rr-md-empty">{emptyLabel}</div>}
    </section>
  </div>
);

// ============================================================
// Products
// ============================================================
const PRODUCT_COLORS = ["#a78bfa", "#5eead4", "#fbbf24", "#fb7185", "#7c8cff", "#34d399", "#f472b6", "#facc15"];

const ProductsEditor = () => {
  const [products, setProducts] = mdUseState(() => window.PRODUCTS.map(p => ({
    ...p,
    color: window.productColor(p.id),
    description: defaultProductDescription(p.id),
    repo: defaultRepo(p.id),
    runbook: defaultRunbook(p.id),
    defaultPair: defaultPairFor(p.id),
    allowedTypes: defaultTypesFor(p.id),
    snowRequired: p.id !== "microservices",
  })));
  const [selectedId, setSelectedId] = mdUseState(products[0]?.id || null);
  const selected = products.find(p => p.id === selectedId);

  const update = (patch) => setProducts(prev => prev.map(p => p.id === selectedId ? { ...p, ...patch } : p));

  const add = () => {
    const id = "product-" + Date.now();
    const next = {
      id,
      name: "new product",
      owner: "Team —",
      brokers: [],
      color: PRODUCT_COLORS[products.length % PRODUCT_COLORS.length],
      description: "",
      repo: "",
      runbook: "",
      defaultPair: [],
      allowedTypes: [],
      snowRequired: false,
    };
    setProducts(prev => [...prev, next]);
    setSelectedId(id);
  };

  const remove = (id) => {
    setProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={products}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New product"
      renderListItem={(p) => (
        <>
          <span className="rr-md-list-dot" style={{ background: p.color }} />
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">{p.name}</div>
            <div className="rr-md-list-meta">
              <span>{p.owner}</span>
              <span className="rr-md-list-sep">·</span>
              <span className="rr-mono">{p.brokers.length} brokers</span>
            </div>
          </div>
        </>
      )}
      renderDetail={() => <ProductDetail product={selected} onChange={update} onRemove={() => remove(selected.id)} />}
    />
  );
};

const ProductDetail = ({ product, onChange, onRemove }) => {
  const [brokerDraft, setBrokerDraft] = mdUseState("");

  const addBroker = () => {
    const v = brokerDraft.trim();
    if (!v) return;
    onChange({ brokers: [...product.brokers, v] });
    setBrokerDraft("");
  };
  const removeBroker = (b) => onChange({ brokers: product.brokers.filter(x => x !== b) });

  const togglePair = (actorId) => {
    const has = product.defaultPair.includes(actorId);
    onChange({
      defaultPair: has
        ? product.defaultPair.filter(x => x !== actorId)
        : (product.defaultPair.length < 2 ? [...product.defaultPair, actorId] : [product.defaultPair[1], actorId])
    });
  };
  const toggleType = (typeId) => {
    const has = product.allowedTypes.includes(typeId);
    onChange({ allowedTypes: has ? product.allowedTypes.filter(x => x !== typeId) : [...product.allowedTypes, typeId] });
  };

  return (
    <div className="rr-md-detail-inner">
      <header className="rr-md-detail-head">
        <div className="rr-md-detail-head-l">
          <span className="rr-md-detail-dot" style={{ background: product.color }} />
          <div>
            <div className="rr-md-detail-eyebrow">PRODUCT · <span className="rr-mono">{product.id}</span></div>
            <h2>{product.name}</h2>
          </div>
        </div>
        <div className="rr-md-detail-head-r">
          <button className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.copy} size={12} /> Duplicate</button>
          <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={onRemove}>
            <Icon d={ICONS.x} size={12} /> Delete
          </button>
        </div>
      </header>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Identity</div>
        <div className="rr-form-grid">
          <label className="rr-field">
            <span>Name</span>
            <input value={product.name} onChange={e => onChange({ name: e.target.value })} />
          </label>
          <label className="rr-field">
            <span>Owner / Team</span>
            <input value={product.owner} onChange={e => onChange({ owner: e.target.value })} />
          </label>
          <label className="rr-field">
            <span>Repository / monorepo path</span>
            <input value={product.repo} onChange={e => onChange({ repo: e.target.value })} placeholder="git@…/tms-platform/operator" />
          </label>
          <label className="rr-field">
            <span>Runbook URL</span>
            <input value={product.runbook} onChange={e => onChange({ runbook: e.target.value })} placeholder="https://docs.example/runbooks/operator" />
          </label>
          <label className="rr-field rr-field-wide">
            <span>Description</span>
            <textarea rows={2} value={product.description} onChange={e => onChange({ description: e.target.value })} />
          </label>
          <div className="rr-field">
            <span>Timeline accent color</span>
            <div className="rr-color-row">
              {PRODUCT_COLORS.map(c => (
                <button key={c}
                        className={"rr-color-sw " + (product.color === c ? "is-on" : "")}
                        style={{ background: c }}
                        onClick={() => onChange({ color: c })} />
              ))}
            </div>
          </div>
          <label className="rr-field">
            <span>SNOW change required for prod</span>
            <div className="rr-switch-row">
              <button
                className={"rr-switch " + (product.snowRequired ? "is-on" : "")}
                onClick={() => onChange({ snowRequired: !product.snowRequired })}
                aria-pressed={product.snowRequired}
              >
                <span className="rr-switch-thumb" />
              </button>
              <span className="rr-switch-label">{product.snowRequired ? "Required" : "Not required"}</span>
            </div>
          </label>
        </div>
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Brokers <span className="rr-muted">({product.brokers.length})</span></div>
        <div className="rr-md-broker-grid">
          {product.brokers.map(b => (
            <div key={b} className="rr-md-broker">
              <code>{b}</code>
              <button className="rr-md-broker-x" onClick={() => removeBroker(b)} title="Remove">
                <Icon d={ICONS.x} size={11} />
              </button>
            </div>
          ))}
          <div className="rr-md-broker-add">
            <input
              value={brokerDraft}
              placeholder="e.g. frankfurt-03"
              onChange={e => setBrokerDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBroker(); } }}
            />
            <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={addBroker}>
              <Icon d={ICONS.plus} size={11} /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Default execution pair</div>
        <p className="rr-md-section-hint">Suggested actors when creating a new rollout for this product. Required for non-microservice deployments.</p>
        <div className="rr-pair-pickers">
          {window.ACTORS.filter(a => a.role === "admin").map(a => {
            const on = product.defaultPair.includes(a.id);
            return (
              <button key={a.id}
                      className={"rr-pair-pick " + (on ? "is-on" : "")}
                      onClick={() => togglePair(a.id)}>
                <Avatar id={a.id} size={20} />
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Allowed rollout types</div>
        <p className="rr-md-section-hint">Only these RolloutTypes show up in the “New rollout” dropdown for this product.</p>
        <div className="rr-md-type-grid">
          {window.ROLLOUT_TYPES.map(t => {
            const on = product.allowedTypes.includes(t.id);
            return (
              <button key={t.id}
                      className={"rr-md-type-card " + (on ? "is-on" : "")}
                      onClick={() => toggleType(t.id)}>
                <div className="rr-md-type-card-top">
                  <Badge tone={t.tone}>{t.short}</Badge>
                  {on && <Icon d={ICONS.check} size={12} className="rr-md-type-tick" />}
                </div>
                <div className="rr-md-type-card-name">{t.name}</div>
                <div className="rr-md-type-card-meta">
                  {(t.cascadePlan || []).length > 1
                    ? `${t.cascadePlan.length} stages · ${(t.cascadePlan || []).slice(1).map(p => "+" + window.formatDelay(p.delayHours)).join(" / ")}`
                    : "single-stage"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Rollout Types
// ============================================================
const RolloutTypesEditor = () => {
  const [types, setTypes] = mdUseState(() => window.ROLLOUT_TYPES.map(t => ({ ...t })));
  const [selectedId, setSelectedId] = mdUseState(types[0]?.id);
  const selected = types.find(t => t.id === selectedId);
  const update = (patch) => setTypes(prev => prev.map(t => t.id === selectedId ? { ...t, ...patch } : t));

  const add = () => {
    const id = "type-" + Date.now();
    const next = { id, name: "new rollout type", short: "new", tone: "neutral", cascadePlan: [{ stage: "non-prod", delayHours: 0 }], announce: "", rules: [], tasks: [] };
    setTypes(prev => [...prev, next]);
    setSelectedId(id);
  };
  const remove = (id) => {
    setTypes(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={types}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New rollout type"
      renderListItem={(t) => (
        <>
          <Badge tone={t.tone}>{t.short}</Badge>
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">{t.name}</div>
            <div className="rr-md-list-meta">
              <span>{(t.cascadePlan || []).length > 1 ? `cascade · ${t.cascadePlan.length} stages` : "single-stage"}</span>
              <span className="rr-md-list-sep">·</span>
              <span className="rr-mono">{t.tasks.length} tasks</span>
            </div>
          </div>
        </>
      )}
      renderDetail={() => <RolloutTypeDetail type={selected} onChange={update} onRemove={() => remove(selected.id)} />}
    />
  );
};

const RolloutTypeDetail = ({ type, onChange, onRemove }) => {
  const [taskDraft, setTaskDraft] = mdUseState("");
  const [ruleDraft, setRuleDraft] = mdUseState("");

  const addTask = () => {
    if (!taskDraft.trim()) return;
    onChange({ tasks: [...type.tasks, taskDraft.trim()] });
    setTaskDraft("");
  };
  const removeTask = (i) => onChange({ tasks: type.tasks.filter((_, idx) => idx !== i) });
  const moveTask = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= type.tasks.length) return;
    const t = [...type.tasks]; [t[i], t[j]] = [t[j], t[i]]; onChange({ tasks: t });
  };
  const editTask = (i, v) => { const t = [...type.tasks]; t[i] = v; onChange({ tasks: t }); };

  const addRule = () => {
    if (!ruleDraft.trim()) return;
    onChange({ rules: [...type.rules, ruleDraft.trim()] });
    setRuleDraft("");
  };
  const removeRule = (i) => onChange({ rules: type.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="rr-md-detail-inner">
      <header className="rr-md-detail-head">
        <div className="rr-md-detail-head-l">
          <Badge tone={type.tone}>{type.short}</Badge>
          <div>
            <div className="rr-md-detail-eyebrow">ROLLOUT TYPE · <span className="rr-mono">{type.id}</span></div>
            <h2>{type.name}</h2>
          </div>
        </div>
        <div className="rr-md-detail-head-r">
          <button className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.copy} size={12} /> Duplicate</button>
          <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={onRemove}>
            <Icon d={ICONS.x} size={12} /> Delete
          </button>
        </div>
      </header>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Identity</div>
        <div className="rr-form-grid">
          <label className="rr-field">
            <span>Display name</span>
            <input value={type.name} onChange={e => onChange({ name: e.target.value })} />
          </label>
          <label className="rr-field">
            <span>Short label</span>
            <input value={type.short} onChange={e => onChange({ short: e.target.value })} />
          </label>
          <label className="rr-field">
            <span>Severity tone</span>
            <select value={type.tone} onChange={e => onChange({ tone: e.target.value })}>
              <option value="neutral">Neutral</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="danger">Danger</option>
            </select>
          </label>
          <div className="rr-field">
            <span>Announce policy <em>(derived from cascade · read-only)</em></span>
            <div className="rr-md-derived">
              <Icon d={ICONS.bolt} size={12} />
              <span className="rr-mono">{window.deriveAnnouncePolicy(type) || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Cascade plan <span className="rr-muted">({(type.cascadePlan || []).length} stage{(type.cascadePlan || []).length !== 1 ? "s" : ""})</span></div>
        <p className="rr-md-section-hint">Ordered list of stages this rollout type goes through. The first stage runs at start; each subsequent stage runs <em>delay-hours</em> later. Announce policy and pair-requirement come from each stage's own definition.</p>

        <CascadePlanEditor
          plan={type.cascadePlan || []}
          onChange={(plan) => onChange({ cascadePlan: plan })}
        />
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Rules <span className="rr-muted">({type.rules.length})</span></div>
        <ul className="rr-md-rules">
          {type.rules.map((r, i) => (
            <li key={i}>
              <Icon d={ICONS.check} size={12} />
              <span>{r}</span>
              <button className="rr-md-row-x" onClick={() => removeRule(i)}><Icon d={ICONS.x} size={11} /></button>
            </li>
          ))}
        </ul>
        <div className="rr-md-row-add">
          <input value={ruleDraft} placeholder="Add a rule…" onChange={e => setRuleDraft(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }} />
          <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={addRule}><Icon d={ICONS.plus} size={11} /> Add rule</button>
        </div>
      </div>

      <div className="rr-md-section">
        <div className="rr-md-section-title">Inherited tasks <span className="rr-muted">({type.tasks.length})</span></div>
        <p className="rr-md-section-hint">These tasks are copied into every new rollout of this type. Drag-order matters.</p>
        <ol className="rr-md-tasks">
          {type.tasks.map((t, i) => (
            <li key={i} className="rr-md-task">
              <span className="rr-md-task-no rr-mono">{String(i+1).padStart(2, "0")}</span>
              <input value={t} onChange={e => editTask(i, e.target.value)} />
              <div className="rr-md-task-tools">
                <button className="rr-icon-btn" onClick={() => moveTask(i, -1)} title="Move up">
                  <Icon d={ICONS.chev} size={12} className="rr-rot-270" />
                </button>
                <button className="rr-icon-btn" onClick={() => moveTask(i, +1)} title="Move down">
                  <Icon d={ICONS.chev} size={12} className="rr-rot-90" />
                </button>
                <button className="rr-icon-btn rr-md-row-x" onClick={() => removeTask(i)} title="Remove">
                  <Icon d={ICONS.x} size={12} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div className="rr-md-row-add">
          <input value={taskDraft} placeholder="Add a task…" onChange={e => setTaskDraft(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }} />
          <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={addTask}><Icon d={ICONS.plus} size={11} /> Add task</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Cascade-plan editor (used by Rollout Types)
// ============================================================
const CascadePlanEditor = ({ plan, onChange }) => {
  const allStageKeys = Object.keys(window.STAGE);
  const usedKeys = new Set(plan.map(p => p.stage));
  const unusedStageKeys = allStageKeys.filter(k => !usedKeys.has(k));

  const update = (i, patch) => onChange(plan.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const remove = (i) => onChange(plan.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= plan.length) return;
    const n = [...plan]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  const addStage = (key) => {
    const last = plan[plan.length - 1];
    const delay = last ? (last.delayHours || 0) + 168 : 0;
    onChange([...plan, { stage: key, delayHours: delay }]);
  };

  return (
    <div className="rr-cp-edit">
      {plan.length === 0 && (
        <div className="rr-cp-empty">No stages yet — pick the first one to start the cascade.</div>
      )}

      <ol className="rr-cp-list">
        {plan.map((p, i) => {
          const s = window.getStage(p.stage);
          const prev = i > 0 ? plan[i - 1] : null;
          const stepDelta = prev ? (p.delayHours || 0) - (prev.delayHours || 0) : 0;
          return (
            <li key={i} className="rr-cp-row">
              <div className="rr-cp-row-stagechip" style={{ background: s.color, color: "#0a0a0c" }}>
                {s.short}
              </div>

              <div className="rr-cp-row-body">
                <div className="rr-cp-row-stage">
                  <select value={p.stage} onChange={e => update(i, { stage: e.target.value })}>
                    {allStageKeys.map(k => (
                      <option key={k} value={k} disabled={usedKeys.has(k) && k !== p.stage}>
                        {window.STAGE[k].label}
                      </option>
                    ))}
                  </select>
                  <span className="rr-cp-row-meta">
                    <Icon d={ICONS.bolt} size={11} />
                    announces on <strong>{s.announceChannel}</strong> · min advance <strong>{window.formatDelay(s.minAdvanceHours)}</strong>
                  </span>
                </div>

                <div className="rr-cp-row-delay">
                  <label className="rr-field">
                    <span>Delay from start (hours)</span>
                    <div className="rr-cp-row-delay-input">
                      <input type="number" min="0" step="1"
                             value={p.delayHours || 0}
                             onChange={e => update(i, { delayHours: Number(e.target.value) })}
                             disabled={i === 0} />
                      <span className="rr-cp-row-delay-suffix">
                        = {window.formatDelay(p.delayHours || 0)}
                        {prev && stepDelta > 0 && <em> · +{window.formatDelay(stepDelta)} after {window.getStage(prev.stage).short}</em>}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="rr-cp-row-tools">
                <button className="rr-icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  <Icon d={ICONS.chev} size={12} className="rr-rot-270" />
                </button>
                <button className="rr-icon-btn" disabled={i === plan.length - 1} onClick={() => move(i, +1)} title="Move down">
                  <Icon d={ICONS.chev} size={12} className="rr-rot-90" />
                </button>
                <button className="rr-icon-btn rr-md-row-x" onClick={() => remove(i)} title="Remove">
                  <Icon d={ICONS.x} size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {unusedStageKeys.length > 0 && (
        <div className="rr-cp-add">
          <span className="rr-cp-add-label">Add stage:</span>
          {unusedStageKeys.map(k => {
            const s = window.STAGE[k];
            return (
              <button key={k} className="rr-cp-add-btn" onClick={() => addStage(k)}>
                <span className="rr-md-stage-chip" style={{ background: s.color, color: "#0a0a0c" }}>{s.short}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Channels (announce channels — Teams, Slack, Email)
// ============================================================
const CHANNEL_KIND = {
  teams: { label: "Microsoft Teams", icon: "people", color: "#4f6bed" },
  slack: { label: "Slack",           icon: "people", color: "#4a154b" },
  email: { label: "Email",           icon: "link",   color: "#5eead4" },
  webhook: { label: "Custom Webhook",icon: "bolt",   color: "#fbbf24" },
};

const DEFAULT_TEMPLATE_PROD = `📦 **{{rollout.title}}** — {{type.short}}

**Product:** {{product.name}}
**Stage:** {{stage.label}} · {{stage.region}}
**Window:** {{stage.dateLocal}} · ~{{stage.durationHours}}h
**Pair:** {{rollout.pair}}

{{rollout.descExt}}

_Risks:_ {{rollout.risks}}

— ReleaseRadar (rollout-id {{rollout.id}})`;

const DEFAULT_TEMPLATE_NP = `🔧 **{{rollout.title}}** — {{type.short}}

Heads-up: deploying to **{{stage.label}}** at {{stage.dateLocal}} (~{{stage.durationHours}}h).
Pair: {{rollout.pair}} · ID: {{rollout.id}}

{{rollout.descInt}}`;

const CHANNELS_INIT = [
  {
    id: "ch-1", key: "TMS_NP",
    name: "TMS Non-Prod Announcements",
    kind: "teams", color: "#a78bfa",
    description: "Internal heads-up channel for all non-prod deployments. Used as the 'announces on' channel for the non-prod stage.",
    health: "ok",
    integration: {
      tenantId:    "8d5b1a2c-4e7a-44b2-b3f0-2a3a51e5c7d1",
      teamId:      "19:a4b2…@thread.tacv2",
      channelId:   "tms-nonprod-deploys",
      webhookUrl:  "https://prod-12.westeurope.logic.azure.com/workflows/abc.../triggers/manual/paths/invoke?api-version=2016-06-01&sig=…",
      mentions:    ["@tms-platform"],
      retry: { maxAttempts: 3, strategy: "exponential", initialDelaySec: 5, alertOnFinalFail: false, dedupeMin: 15 },
    },
    template: DEFAULT_TEMPLATE_NP,
    minAdvanceHours: 1,
    sendOn: ["scheduled", "active", "done", "failed"],
    quietHours: { enabled: false, from: "22:00", to: "07:00" },
    locale: "de-CH",
  },
  {
    id: "ch-2", key: "TMS_PROD",
    name: "TMS Production Announcements",
    kind: "teams", color: "#5eead4",
    description: "Customer-facing announcement channel. SNOW-change-bound. Anything posted here is visible to tenant owners.",
    health: "ok",
    integration: {
      tenantId:    "8d5b1a2c-4e7a-44b2-b3f0-2a3a51e5c7d1",
      teamId:      "19:c9d4…@thread.tacv2",
      channelId:   "tms-prod-deploys",
      webhookUrl:  "https://prod-12.westeurope.logic.azure.com/workflows/def.../triggers/manual/paths/invoke?api-version=2016-06-01&sig=…",
      mentions:    ["@tms-platform", "@customer-success"],
      retry: { maxAttempts: 5, strategy: "exponential", initialDelaySec: 10, alertOnFinalFail: true, dedupeMin: 60 },
    },
    template: DEFAULT_TEMPLATE_PROD,
    minAdvanceHours: 168,
    sendOn: ["scheduled", "active", "done", "failed"],
    quietHours: { enabled: true, from: "20:00", to: "06:00" },
    locale: "de-CH",
  },
  {
    id: "ch-3", key: "SNOW_CHG",
    name: "ServiceNow Change Email",
    kind: "email", color: "#fbbf24",
    description: "Auto-attaches the rollout summary to the linked SNOW change request.",
    health: "warn",
    integration: {
      smtpHost:    "smtp.example.com:587",
      from:        "releaseradar@tms-platform.example",
      to:          "change-mgmt@example.com",
      cc:          "tms-platform-leads@example.com",
      authMethod:  "OAuth2",
    },
    template: "ReleaseRadar attaches: {{rollout.title}} ({{rollout.id}})\nSee {{rollout.runbook}}",
    minAdvanceHours: 168,
    sendOn: ["scheduled"],
    quietHours: { enabled: false },
    locale: "en",
  },
];

const TEMPLATE_VARS = [
  { v: "{{rollout.title}}",          desc: "Rollout title" },
  { v: "{{rollout.id}}",             desc: "Rollout id (e.g. r-101)" },
  { v: "{{rollout.descExt}}",        desc: "External description" },
  { v: "{{rollout.descInt}}",        desc: "Internal description" },
  { v: "{{rollout.risks}}",          desc: "Risk text" },
  { v: "{{rollout.pair}}",           desc: "Comma-separated pair names" },
  { v: "{{rollout.runbook}}",        desc: "Runbook URL" },
  { v: "{{type.name}}",              desc: "Rollout type name" },
  { v: "{{type.short}}",             desc: "Rollout type short label" },
  { v: "{{product.name}}",           desc: "Product name" },
  { v: "{{stage.label}}",            desc: "Stage label (e.g. prod1 · Frankfurt)" },
  { v: "{{stage.region}}",           desc: "Stage region" },
  { v: "{{stage.dateLocal}}",        desc: "Stage start (locale-aware)" },
  { v: "{{stage.durationHours}}",    desc: "Stage duration in hours" },
];

const ChannelsEditor = () => {
  const [channels, setChannels] = mdUseState(CHANNELS_INIT);
  const [selectedId, setSelectedId] = mdUseState(channels[0]?.id);
  const selected = channels.find(c => c.id === selectedId);
  const update = (patch) => setChannels(prev => prev.map(c => c.id === selectedId ? { ...c, ...patch } : c));
  const updateIntegration = (patch) =>
    setChannels(prev => prev.map(c => c.id === selectedId ? { ...c, integration: { ...c.integration, ...patch } } : c));

  const add = (kind = "teams") => {
    const id = "ch-" + Date.now();
    const next = {
      id, key: "NEW_CHANNEL",
      name: "New channel",
      kind, color: "#7c8cff",
      description: "",
      health: "untested",
      integration: kind === "teams"
        ? { tenantId: "", teamId: "", channelId: "", webhookUrl: "", mentions: [], retry: { maxAttempts: 3, strategy: "exponential", initialDelaySec: 5, alertOnFinalFail: false, dedupeMin: 15 } }
        : kind === "email"
        ? { smtpHost: "", from: "", to: "", cc: "", authMethod: "OAuth2" }
        : { url: "", method: "POST", headers: {} },
      template: DEFAULT_TEMPLATE_NP,
      minAdvanceHours: 24,
      sendOn: ["scheduled"],
      quietHours: { enabled: false, from: "22:00", to: "07:00" },
      locale: "en",
    };
    setChannels(prev => [...prev, next]); setSelectedId(id);
  };
  const remove = (id) => {
    setChannels(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={channels}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={() => add("teams")}
      addLabel="New channel"
      renderListItem={(c) => {
        const kind = CHANNEL_KIND[c.kind] || CHANNEL_KIND.webhook;
        return (
          <>
            <span className="rr-md-channel-ic" style={{ background: kind.color + "22", color: kind.color, borderColor: kind.color + "55" }}>
              <Icon d={ICONS[kind.icon]} size={12} />
            </span>
            <div className="rr-md-list-body">
              <div className="rr-md-list-name">
                {c.name}
                <span className={"rr-md-health rr-md-health-" + c.health}>{c.health}</span>
              </div>
              <div className="rr-md-list-meta">
                <span className="rr-mono">{c.key}</span>
                <span className="rr-md-list-sep">·</span>
                <span>{kind.label}</span>
              </div>
            </div>
          </>
        );
      }}
      renderDetail={() => selected && <ChannelDetail
        channel={selected}
        onChange={update}
        onChangeIntegration={updateIntegration}
        onRemove={() => remove(selected.id)}
      />}
    />
  );
};

const ChannelDetail = ({ channel, onChange, onChangeIntegration, onRemove }) => {
  const kind = CHANNEL_KIND[channel.kind] || CHANNEL_KIND.webhook;
  const [showTemplateHelp, setShowTemplateHelp] = mdUseState(false);
  const [testResult, setTestResult] = mdUseState(null);

  const sampleRender = renderTemplate(channel.template);

  const toggleSendOn = (v) => {
    const arr = channel.sendOn;
    onChange({ sendOn: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] });
  };

  const sendTest = () => {
    setTestResult("sending");
    setTimeout(() => {
      setTestResult(channel.integration.webhookUrl || channel.integration.smtpHost ? "ok" : "missing");
    }, 700);
  };

  return (
    <div className="rr-md-detail-inner">
      <header className="rr-md-detail-head">
        <div className="rr-md-detail-head-l">
          <span className="rr-md-channel-ic rr-md-channel-ic-lg" style={{ background: kind.color + "22", color: kind.color, borderColor: kind.color + "55" }}>
            <Icon d={ICONS[kind.icon]} size={18} />
          </span>
          <div>
            <div className="rr-md-detail-eyebrow">CHANNEL · <span className="rr-mono">{channel.id}</span> · {kind.label}</div>
            <h2>{channel.name}</h2>
          </div>
        </div>
        <div className="rr-md-detail-head-r">
          <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={sendTest}>
            <Icon d={ICONS.bolt} size={12} /> Send test message
          </button>
          <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={onRemove}>
            <Icon d={ICONS.x} size={12} /> Delete
          </button>
        </div>
      </header>

      {testResult && (
        <div className={"rr-md-test " + (testResult === "ok" ? "is-ok" : testResult === "missing" ? "is-warn" : "")}>
          {testResult === "sending" && <><Icon d={ICONS.bolt} size={12} /> Sending test payload…</>}
          {testResult === "ok" && <><Icon d={ICONS.check} size={12} /> Test message delivered to <code>{channel.integration.channelId || channel.integration.to || "endpoint"}</code> at {new Date().toLocaleTimeString("en-GB").slice(0,5)}.</>}
          {testResult === "missing" && <><Icon d={ICONS.warn} size={12} /> Cannot send — fill the integration credentials below first.</>}
        </div>
      )}

      <div className="rr-md-section">
        <div className="rr-md-section-title">Identity</div>
        <div className="rr-form-grid">
          <label className="rr-field">
            <span>Channel kind</span>
            <select value={channel.kind} onChange={e => onChange({ kind: e.target.value })}>
              {Object.entries(CHANNEL_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="rr-field">
            <span>Key <em>(referenced by stages — uppercase)</em></span>
            <input value={channel.key} onChange={e => onChange({ key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} />
          </label>
          <label className="rr-field rr-field-wide">
            <span>Display name</span>
            <input value={channel.name} onChange={e => onChange({ name: e.target.value })} />
          </label>
          <label className="rr-field rr-field-wide">
            <span>Description</span>
            <textarea rows={2} value={channel.description} onChange={e => onChange({ description: e.target.value })} />
          </label>
          <label className="rr-field">
            <span>Locale</span>
            <select value={channel.locale} onChange={e => onChange({ locale: e.target.value })}>
              <option value="en">en</option>
              <option value="de-CH">de-CH</option>
              <option value="de-DE">de-DE</option>
              <option value="fr-CH">fr-CH</option>
            </select>
          </label>
          <label className="rr-field">
            <span>Min advance notice (hours)</span>
            <input type="number" min="0" value={channel.minAdvanceHours}
                   onChange={e => onChange({ minAdvanceHours: Number(e.target.value) })} />
          </label>
        </div>
      </div>

      {/* Integration-specific block */}
      {channel.kind === "teams" && (
        <div className="rr-md-section">
          <div className="rr-md-section-title">Teams integration</div>
          <p className="rr-md-section-hint">Set up an Incoming Webhook in your Teams channel and paste the URL here. Tenant + Team + Channel IDs are needed for adaptive-card rich rendering and @mentions.</p>

          <div className="rr-md-teams-banner">
            <div className="rr-md-teams-logo">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M14 6h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M4 4h10v16H4z"/></svg>
            </div>
            <div>
              <strong>Microsoft Teams</strong>
              <div className="rr-md-teams-status">
                <span className="rr-status-dot" /> Workspace connected · tenant <code>tms-platform</code>
                <button className="rr-link">Re-authenticate</button>
              </div>
            </div>
          </div>

          <div className="rr-form-grid">
            <label className="rr-field rr-field-wide">
              <span>Incoming Webhook URL</span>
              <input value={channel.integration.webhookUrl} placeholder="https://…/workflows/…/triggers/manual/paths/invoke?…"
                     onChange={e => onChangeIntegration({ webhookUrl: e.target.value })} />
            </label>
            <label className="rr-field">
              <span>Tenant ID</span>
              <input value={channel.integration.tenantId}
                     onChange={e => onChangeIntegration({ tenantId: e.target.value })} placeholder="GUID" />
            </label>
            <label className="rr-field">
              <span>Team ID</span>
              <input value={channel.integration.teamId}
                     onChange={e => onChangeIntegration({ teamId: e.target.value })} placeholder="19:…@thread.tacv2" />
            </label>
            <label className="rr-field">
              <span>Channel ID / slug</span>
              <input value={channel.integration.channelId}
                     onChange={e => onChangeIntegration({ channelId: e.target.value })} />
            </label>
            <label className="rr-field">
              <span>Mentions</span>
              <input value={(channel.integration.mentions || []).join(", ")}
                     onChange={e => onChangeIntegration({ mentions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                     placeholder="@tms-platform, @customer-success" />
            </label>
          </div>

          <div className="rr-md-retry">
            <div className="rr-md-retry-head">
              <span className="rr-md-section-title" style={{ padding: 0, margin: 0 }}>Retry policy</span>
              <span className="rr-md-retry-summary rr-mono">{retrySummary(channel.integration.retry)}</span>
            </div>
            <div className="rr-form-grid">
              <label className="rr-field">
                <span>Max attempts</span>
                <input type="number" min="1" max="20"
                       value={channel.integration.retry?.maxAttempts ?? 3}
                       onChange={e => onChangeIntegration({ retry: { ...channel.integration.retry, maxAttempts: Number(e.target.value) } })} />
              </label>
              <label className="rr-field">
                <span>Backoff strategy</span>
                <select value={channel.integration.retry?.strategy || "exponential"}
                        onChange={e => onChangeIntegration({ retry: { ...channel.integration.retry, strategy: e.target.value } })}>
                  <option value="exponential">Exponential</option>
                  <option value="linear">Linear</option>
                  <option value="fixed">Fixed interval</option>
                  <option value="none">No retry</option>
                </select>
              </label>
              <label className="rr-field">
                <span>Initial delay (sec)</span>
                <input type="number" min="0" max="3600"
                       value={channel.integration.retry?.initialDelaySec ?? 5}
                       onChange={e => onChangeIntegration({ retry: { ...channel.integration.retry, initialDelaySec: Number(e.target.value) } })} />
              </label>
              <label className="rr-field">
                <span>Dedupe window (min)</span>
                <input type="number" min="0" max="1440"
                       value={channel.integration.retry?.dedupeMin ?? 15}
                       onChange={e => onChangeIntegration({ retry: { ...channel.integration.retry, dedupeMin: Number(e.target.value) } })} />
              </label>
              <label className="rr-field rr-field-wide">
                <span>Alert on final failure</span>
                <div className="rr-switch-row">
                  <button className={"rr-switch " + (channel.integration.retry?.alertOnFinalFail ? "is-on" : "")}
                          onClick={() => onChangeIntegration({ retry: { ...channel.integration.retry, alertOnFinalFail: !channel.integration.retry?.alertOnFinalFail } })}
                          aria-pressed={!!channel.integration.retry?.alertOnFinalFail}>
                    <span className="rr-switch-thumb" />
                  </button>
                  <span className="rr-switch-label">
                    {channel.integration.retry?.alertOnFinalFail
                      ? "Page on-call after final retry fails"
                      : "Log only — no escalation"}
                  </span>
                </div>
              </label>
            </div>

            <ScheduleTimeline retry={channel.integration.retry} />
          </div>
        </div>
      )}

      {channel.kind === "email" && (
        <div className="rr-md-section">
          <div className="rr-md-section-title">Email integration</div>
          <div className="rr-form-grid">
            <label className="rr-field"><span>SMTP host</span><input value={channel.integration.smtpHost || ""} onChange={e => onChangeIntegration({ smtpHost: e.target.value })} placeholder="smtp.example.com:587" /></label>
            <label className="rr-field"><span>Auth method</span>
              <select value={channel.integration.authMethod || "OAuth2"} onChange={e => onChangeIntegration({ authMethod: e.target.value })}>
                <option>OAuth2</option><option>STARTTLS + password</option><option>None (relay)</option>
              </select>
            </label>
            <label className="rr-field"><span>From</span><input value={channel.integration.from || ""} onChange={e => onChangeIntegration({ from: e.target.value })} /></label>
            <label className="rr-field"><span>To</span><input value={channel.integration.to || ""} onChange={e => onChangeIntegration({ to: e.target.value })} /></label>
            <label className="rr-field rr-field-wide"><span>CC</span><input value={channel.integration.cc || ""} onChange={e => onChangeIntegration({ cc: e.target.value })} /></label>
          </div>
        </div>
      )}

      {(channel.kind === "webhook" || channel.kind === "slack") && (
        <div className="rr-md-section">
          <div className="rr-md-section-title">{channel.kind === "slack" ? "Slack" : "Webhook"} integration</div>
          <div className="rr-form-grid">
            <label className="rr-field rr-field-wide"><span>URL</span><input value={channel.integration.url || channel.integration.webhookUrl || ""} onChange={e => onChangeIntegration({ url: e.target.value })} /></label>
            <label className="rr-field"><span>Method</span>
              <select value={channel.integration.method || "POST"} onChange={e => onChangeIntegration({ method: e.target.value })}>
                <option>POST</option><option>PUT</option><option>PATCH</option>
              </select>
            </label>
            <label className="rr-field"><span>Auth header</span><input value={channel.integration.authHeader || ""} onChange={e => onChangeIntegration({ authHeader: e.target.value })} placeholder="Bearer …" /></label>
          </div>
        </div>
      )}

      {/* Triggers */}
      <div className="rr-md-section">
        <div className="rr-md-section-title">Trigger on rollout state</div>
        <div className="rr-pair-pickers">
          {[
            { id: "scheduled", label: "scheduled" },
            { id: "active",    label: "in flight" },
            { id: "done",      label: "completed" },
            { id: "failed",    label: "failed"    },
            { id: "blocked",   label: "blocked"   },
          ].map(s => {
            const on = channel.sendOn.includes(s.id);
            return (
              <button key={s.id} className={"rr-prod-pick " + (on ? "is-on" : "")} onClick={() => toggleSendOn(s.id)}>
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="rr-md-quiet">
          <label className="rr-field">
            <span>Quiet hours</span>
            <div className="rr-switch-row">
              <button className={"rr-switch " + (channel.quietHours.enabled ? "is-on" : "")}
                      onClick={() => onChange({ quietHours: { ...channel.quietHours, enabled: !channel.quietHours.enabled } })}
                      aria-pressed={channel.quietHours.enabled}>
                <span className="rr-switch-thumb" />
              </button>
              <span className="rr-switch-label">
                {channel.quietHours.enabled
                  ? "Defer to next morning between " + channel.quietHours.from + " and " + channel.quietHours.to
                  : "Send any time"}
              </span>
            </div>
          </label>
          {channel.quietHours.enabled && (
            <>
              <label className="rr-field"><span>From</span><input type="time" value={channel.quietHours.from} onChange={e => onChange({ quietHours: { ...channel.quietHours, from: e.target.value } })} /></label>
              <label className="rr-field"><span>To</span><input type="time" value={channel.quietHours.to} onChange={e => onChange({ quietHours: { ...channel.quietHours, to: e.target.value } })} /></label>
            </>
          )}
        </div>
      </div>

      {/* Template */}
      <div className="rr-md-section">
        <div className="rr-md-section-title">
          Announcement template
          <button className="rr-link" onClick={() => setShowTemplateHelp(v => !v)} style={{ marginLeft: "auto" }}>
            {showTemplateHelp ? "Hide variables" : "Show variables"}
          </button>
        </div>
        <p className="rr-md-section-hint">Use <code>{`{{variable}}`}</code> placeholders. Markdown is rendered for Teams; plaintext for email/webhook.</p>

        {showTemplateHelp && (
          <div className="rr-md-vars">
            {TEMPLATE_VARS.map(v => (
              <div key={v.v} className="rr-md-var">
                <code>{v.v}</code>
                <span>{v.desc}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rr-md-template-grid">
          <label className="rr-field rr-field-wide">
            <span>Template source</span>
            <textarea rows={10} value={channel.template} onChange={e => onChange({ template: e.target.value })} />
          </label>
          <div className="rr-field rr-field-wide">
            <span>Preview <em>(rendered with sample data)</em></span>
            <div className="rr-md-preview" dangerouslySetInnerHTML={{ __html: sampleRender }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// Retry helpers
function retrySummary(r) {
  if (!r || r.strategy === "none" || (r.maxAttempts || 0) <= 1) return "no retry";
  const total = retrySchedule(r).reduce((a, b) => a + b, 0);
  return `${r.maxAttempts}× · ${r.strategy} · total ~${formatSec(total)}` + (r.alertOnFinalFail ? " · page on fail" : "");
}
function retrySchedule(r) {
  if (!r) return [];
  const max = r.maxAttempts || 1;
  const init = r.initialDelaySec ?? 5;
  if (max <= 1) return [];
  if (r.strategy === "none") return [];
  if (r.strategy === "fixed")    return Array(max - 1).fill(init);
  if (r.strategy === "linear")   return Array.from({ length: max - 1 }, (_, i) => init * (i + 1));
  return Array.from({ length: max - 1 }, (_, i) => init * Math.pow(2, i)); // exponential
}
function formatSec(s) {
  if (s < 60) return s + "s";
  if (s < 3600) return Math.round(s / 60) + "m " + (s % 60 ? (s % 60) + "s" : "").trim();
  return Math.round(s / 60) + "m";
}

// Visual schedule timeline (linear-time view of attempt offsets)
const ScheduleTimeline = ({ retry }) => {
  const sched = retrySchedule(retry);
  if (!sched.length) {
    return <div className="rr-md-retry-tl rr-md-retry-tl-empty">Single delivery attempt — no retry.</div>;
  }
  const cum = []; let acc = 0;
  for (const d of sched) { acc += d; cum.push(acc); }
  const total = cum[cum.length - 1];
  return (
    <div className="rr-md-retry-tl">
      <div className="rr-md-retry-tl-label">Attempt schedule (relative to first send)</div>
      <div className="rr-md-retry-tl-bar">
        <span className="rr-md-retry-tl-mark" style={{ left: "0%" }}>
          <span className="rr-md-retry-tl-pip rr-md-retry-tl-pip-first" />
          <span className="rr-md-retry-tl-time">0</span>
        </span>
        {cum.map((c, i) => {
          const isLast = i === cum.length - 1;
          return (
            <span key={i} className="rr-md-retry-tl-mark" style={{ left: (c / total) * 100 + "%" }}>
              <span className={"rr-md-retry-tl-pip " + (isLast ? "rr-md-retry-tl-pip-last" : "")} />
              <span className="rr-md-retry-tl-time">+{formatSec(c)}</span>
              <span className="rr-md-retry-tl-num">#{i + 2}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// Tiny markdown-ish renderer (just enough for preview)
function renderTemplate(tpl) {
  const sample = {
    "rollout.title":    "operator 24.7 — broker auth refactor",
    "rollout.id":       "r-101",
    "rollout.descExt":  "operator 24.7 rollout. Customers may observe transient broker creation latency during the maintenance window.",
    "rollout.descInt":  "Includes oracle migration rev 14 + solace exporter v2.3. Pair-reviewed by Luc/Henning.",
    "rollout.risks":    "Deployment + broker creation disabled for ~2h.",
    "rollout.pair":     "Luc Baumann, Henning Hoffer",
    "rollout.runbook":  "https://docs.example/runbooks/operator",
    "type.name":        "operator feature (oracle & solace)",
    "type.short":       "operator feature",
    "product.name":     "operator",
    "stage.label":      "prod1 · Frankfurt",
    "stage.region":     "Frankfurt-am-Main",
    "stage.dateLocal":  "Mon, 02 Jun 2026 · 10:00 CET",
    "stage.durationHours": "2",
  };
  let out = (tpl || "").replace(/\{\{([\w.]+)\}\}/g, (_, k) => sample[k] !== undefined ? sample[k] : `<span class="rr-md-var-missing">{{${k}}}</span>`);
  // very small md → html
  out = out
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>")
    .replace(/&lt;span class=&quot;rr-md-var-missing&quot;&gt;\{\{([\w.]+)\}\}&lt;\/span&gt;/g, '<span class="rr-md-var-missing">{{$1}}</span>');
  return out;
}

// ============================================================
// Stages (deployment environments: non-prod, prod1, prod2…)
// ============================================================
const STAGE_COLORS = ["#a78bfa", "#5eead4", "#fbbf24", "#fb7185", "#7c8cff", "#34d399", "#f472b6", "#38bdf8"];

const StagesEditor = () => {
  const [stages, setStages] = mdUseState(() => Object.entries(window.STAGE).map(([key, s], i) => ({
    id: key,
    key,                       // immutable key referenced by rollouts
    label: s.label,
    short: s.short,
    color: s.color,
    description: defaultStageDescription(key),
    region: defaultStageRegion(key),
    requiresPair: key !== "non-prod",
    announceChannel: key === "non-prod" ? "TMS_NP" : "TMS_PROD",
    minAdvanceHours: key === "non-prod" ? 1 : 24,
    order: i,
    enabled: true,
  })));
  const [selectedId, setSelectedId] = mdUseState(stages[0]?.id);
  const selected = stages.find(s => s.id === selectedId);
  const update = (patch) => setStages(prev => prev.map(s => s.id === selectedId ? { ...s, ...patch } : s));

  const move = (id, dir) => {
    setStages(prev => {
      const i = prev.findIndex(s => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, k) => ({ ...s, order: k }));
    });
  };

  const add = () => {
    const id = "stage-" + Date.now();
    const next = {
      id, key: "prod3",
      label: "prod3 · new region",
      short: "P3",
      color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
      description: "",
      region: "—",
      requiresPair: true,
      announceChannel: "TMS_PROD",
      minAdvanceHours: 24,
      order: stages.length,
      enabled: true,
    };
    setStages(prev => [...prev, next]);
    setSelectedId(id);
  };
  const remove = (id) => {
    setStages(prev => {
      const next = prev.filter(s => s.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next.map((s, k) => ({ ...s, order: k }));
    });
  };

  return (
    <MDMasterDetail
      items={stages}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New stage"
      renderListItem={(s) => (
        <>
          <span className="rr-md-stage-chip" style={{ background: s.color, color: "#0a0a0c" }}>{s.short}</span>
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">{s.label}</div>
            <div className="rr-md-list-meta">
              <span className="rr-mono">{s.key}</span>
              <span className="rr-md-list-sep">·</span>
              <span>{s.region}</span>
              {!s.enabled && <><span className="rr-md-list-sep">·</span><span style={{ color: "#fca5a5" }}>disabled</span></>}
            </div>
          </div>
        </>
      )}
      renderDetail={() => (
        <div className="rr-md-detail-inner">
          <header className="rr-md-detail-head">
            <div className="rr-md-detail-head-l">
              <span className="rr-md-stage-chip rr-md-stage-chip-lg" style={{ background: selected.color, color: "#0a0a0c" }}>{selected.short}</span>
              <div>
                <div className="rr-md-detail-eyebrow">STAGE · <span className="rr-mono">{selected.key}</span> · order {selected.order + 1}</div>
                <h2>{selected.label}</h2>
              </div>
            </div>
            <div className="rr-md-detail-head-r">
              <button className="rr-icon-btn" onClick={() => move(selected.id, -1)} title="Move up in cascade">
                <Icon d={ICONS.chev} size={12} className="rr-rot-270" />
              </button>
              <button className="rr-icon-btn" onClick={() => move(selected.id, +1)} title="Move down in cascade">
                <Icon d={ICONS.chev} size={12} className="rr-rot-90" />
              </button>
              <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={() => remove(selected.id)}>
                <Icon d={ICONS.x} size={12} /> Delete
              </button>
            </div>
          </header>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Identity</div>
            <div className="rr-form-grid">
              <label className="rr-field">
                <span>Key <em>(referenced by rollouts — cannot collide)</em></span>
                <input value={selected.key} onChange={e => update({ key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              </label>
              <label className="rr-field">
                <span>Short tag (2 chars)</span>
                <input value={selected.short} maxLength={3} onChange={e => update({ short: e.target.value.toUpperCase() })} />
              </label>
              <label className="rr-field rr-field-wide">
                <span>Display label</span>
                <input value={selected.label} onChange={e => update({ label: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Region / location</span>
                <input value={selected.region} onChange={e => update({ region: e.target.value })} placeholder="Frankfurt-am-Main" />
              </label>
              <label className="rr-field">
                <span>Enabled</span>
                <div className="rr-switch-row">
                  <button className={"rr-switch " + (selected.enabled ? "is-on" : "")}
                          onClick={() => update({ enabled: !selected.enabled })}
                          aria-pressed={selected.enabled}>
                    <span className="rr-switch-thumb" />
                  </button>
                  <span className="rr-switch-label">{selected.enabled ? "Selectable for new rollouts" : "Hidden from new rollouts"}</span>
                </div>
              </label>
              <label className="rr-field rr-field-wide">
                <span>Description</span>
                <textarea rows={2} value={selected.description} onChange={e => update({ description: e.target.value })} />
              </label>
              <div className="rr-field rr-field-wide">
                <span>Timeline color</span>
                <div className="rr-color-row">
                  {STAGE_COLORS.map(c => (
                    <button key={c}
                            className={"rr-color-sw " + (selected.color === c ? "is-on" : "")}
                            style={{ background: c }}
                            onClick={() => update({ color: c })} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Execution policy</div>
            <div className="rr-form-grid">
              <label className="rr-field">
                <span>Requires execution pair</span>
                <div className="rr-switch-row">
                  <button className={"rr-switch " + (selected.requiresPair ? "is-on" : "")}
                          onClick={() => update({ requiresPair: !selected.requiresPair })}
                          aria-pressed={selected.requiresPair}>
                    <span className="rr-switch-thumb" />
                  </button>
                  <span className="rr-switch-label">{selected.requiresPair ? "Two actors required" : "Single actor allowed"}</span>
                </div>
              </label>
              <label className="rr-field">
                <span>Announce channel</span>
                <select value={selected.announceChannel} onChange={e => update({ announceChannel: e.target.value })}>
                  <option value="TMS_NP">TMS_NP</option>
                  <option value="TMS_PROD">TMS_PROD</option>
                  <option value="none">— none —</option>
                </select>
              </label>
              <label className="rr-field">
                <span>Min. advance notice (hours)</span>
                <input type="number" min="0" value={selected.minAdvanceHours}
                       onChange={e => update({ minAdvanceHours: Number(e.target.value) })} />
              </label>
            </div>
          </div>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Preview</div>
            <div className="rr-md-stage-preview">
              <div className="rr-md-stage-preview-pill" style={{ borderColor: selected.color, background: "rgba(255,255,255,.02)" }}>
                <span className="rr-pill-tag" style={{ background: selected.color }}>{selected.short}</span>
                <div className="rr-pill-body">
                  <span className="rr-pill-time" style={{ color: selected.color }}>10:00</span>
                  <span className="rr-pill-meta">+2h window</span>
                </div>
              </div>
              <div className="rr-md-stage-preview-meta">
                <div><span className="rr-muted">Cascade order:</span> <strong>#{selected.order + 1}</strong></div>
                <div><span className="rr-muted">Announce:</span> <strong>{selected.announceChannel}</strong> · {selected.minAdvanceHours}h</div>
                <div><span className="rr-muted">Pair:</span> <strong>{selected.requiresPair ? "required" : "optional"}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    />
  );
};

// ============================================================
// Filters (saved filter views shown in the sidebar)
// ============================================================
const FILTER_ICONS = ["timeline", "rollout", "lock", "bolt", "warn", "user", "people"];

const FiltersEditor = () => {
  const [filters, setFilters] = mdUseState(() => [
    {
      id: "f-1", name: "My active rollouts",
      description: "Rollouts where I'm in the executing pair, status active or scheduled.",
      icon: "rollout",
      color: "#7c8cff",
      pinned: true,
      criteria: { products: [], types: [], stages: [], actors: ["luc"], statuses: ["scheduled", "active"] },
    },
    {
      id: "f-2", name: "Hotfixes only",
      description: "All hotfix-type rollouts across products. Useful when the master branch is locked.",
      icon: "warn",
      color: "#ef4444",
      pinned: true,
      criteria: { products: [], types: ["tms-ssp-hf", "operator-hf"], stages: [], actors: [], statuses: [] },
    },
    {
      id: "f-3", name: "Frankfurt brokers",
      description: "Anything touching operator or concentrator on the Frankfurt region.",
      icon: "bolt",
      color: "#5eead4",
      pinned: false,
      criteria: { products: ["operator", "concentrator"], types: [], stages: ["prod1"], actors: [], statuses: [] },
    },
    {
      id: "f-4", name: "Blocked / awaiting",
      description: "Rollouts blocked by a lock or paused.",
      icon: "lock",
      color: "#fbbf24",
      pinned: false,
      criteria: { products: [], types: [], stages: [], actors: [], statuses: ["blocked"] },
    },
  ]);
  const [selectedId, setSelectedId] = mdUseState(filters[0]?.id);
  const selected = filters.find(f => f.id === selectedId);
  const update = (patch) => setFilters(prev => prev.map(f => f.id === selectedId ? { ...f, ...patch } : f));
  const updateCriteria = (patch) => update({ criteria: { ...selected.criteria, ...patch } });

  const toggleIn = (key, val) => {
    const arr = selected.criteria[key];
    updateCriteria({ [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] });
  };

  const add = () => {
    const id = "f-" + Date.now();
    const next = {
      id, name: "New filter", description: "", icon: "timeline", color: "#7c8cff", pinned: false,
      criteria: { products: [], types: [], stages: [], actors: [], statuses: [] },
    };
    setFilters(prev => [...prev, next]); setSelectedId(id);
  };
  const remove = (id) => {
    setFilters(prev => {
      const next = prev.filter(f => f.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={filters}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New filter"
      renderListItem={(f) => (
        <>
          <span className="rr-md-filter-ic" style={{ background: f.color + "22", color: f.color, borderColor: f.color + "55" }}>
            <Icon d={ICONS[f.icon] || ICONS.timeline} size={12} />
          </span>
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">
              {f.name}
              {f.pinned && <span className="rr-md-pin">pinned</span>}
            </div>
            <div className="rr-md-list-meta">
              <span className="rr-mono">{filterSummary(f)}</span>
            </div>
          </div>
        </>
      )}
      renderDetail={() => (
        <div className="rr-md-detail-inner">
          <header className="rr-md-detail-head">
            <div className="rr-md-detail-head-l">
              <span className="rr-md-filter-ic rr-md-filter-ic-lg" style={{ background: selected.color + "22", color: selected.color, borderColor: selected.color + "55" }}>
                <Icon d={ICONS[selected.icon] || ICONS.timeline} size={18} />
              </span>
              <div>
                <div className="rr-md-detail-eyebrow">FILTER · <span className="rr-mono">{selected.id}</span></div>
                <h2>{selected.name}</h2>
              </div>
            </div>
            <div className="rr-md-detail-head-r">
              <button className={"rr-btn rr-btn-ghost rr-btn-sm " + (selected.pinned ? "is-on-ghost" : "")}
                      onClick={() => update({ pinned: !selected.pinned })}>
                <Icon d={ICONS.bolt} size={12} /> {selected.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
              </button>
              <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={() => remove(selected.id)}>
                <Icon d={ICONS.x} size={12} /> Delete
              </button>
            </div>
          </header>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Identity</div>
            <div className="rr-form-grid">
              <label className="rr-field rr-field-wide">
                <span>Name</span>
                <input value={selected.name} onChange={e => update({ name: e.target.value })} />
              </label>
              <label className="rr-field rr-field-wide">
                <span>Description</span>
                <textarea rows={2} value={selected.description} onChange={e => update({ description: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Icon</span>
                <div className="rr-md-icon-row">
                  {FILTER_ICONS.map(i => (
                    <button key={i}
                            className={"rr-md-icon-pick " + (selected.icon === i ? "is-on" : "")}
                            onClick={() => update({ icon: i })}>
                      <Icon d={ICONS[i]} size={14} />
                    </button>
                  ))}
                </div>
              </label>
              <label className="rr-field">
                <span>Accent color</span>
                <div className="rr-color-row">
                  {["#7c8cff", "#a78bfa", "#5eead4", "#fbbf24", "#fb7185", "#ef4444", "#22c55e", "#38bdf8"].map(c => (
                    <button key={c}
                            className={"rr-color-sw " + (selected.color === c ? "is-on" : "")}
                            style={{ background: c }}
                            onClick={() => update({ color: c })} />
                  ))}
                </div>
              </label>
            </div>
          </div>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Criteria</div>
            <p className="rr-md-section-hint">Empty group = no restriction. All restrictions are AND-ed together.</p>

            <div className="rr-md-crit">
              <div className="rr-md-crit-label">Products</div>
              <div className="rr-pair-pickers">
                {window.PRODUCTS.map(p => {
                  const on = selected.criteria.products.includes(p.id);
                  return (
                    <button key={p.id} className={"rr-prod-pick " + (on ? "is-on" : "")} onClick={() => toggleIn("products", p.id)}>
                      <span className="rr-prod-dot" style={{ background: window.productColor(p.id) }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rr-md-crit">
              <div className="rr-md-crit-label">Rollout types</div>
              <div className="rr-pair-pickers">
                {window.ROLLOUT_TYPES.map(t => {
                  const on = selected.criteria.types.includes(t.id);
                  return (
                    <button key={t.id} className={"rr-prod-pick " + (on ? "is-on" : "")} onClick={() => toggleIn("types", t.id)}>
                      <Badge tone={t.tone}>{t.short}</Badge>
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rr-md-crit">
              <div className="rr-md-crit-label">Stages</div>
              <div className="rr-pair-pickers">
                {Object.entries(window.STAGE).map(([k, s]) => {
                  const on = selected.criteria.stages.includes(k);
                  return (
                    <button key={k} className={"rr-prod-pick " + (on ? "is-on" : "")} onClick={() => toggleIn("stages", k)}>
                      <span className="rr-md-stage-chip" style={{ background: s.color, color: "#0a0a0c" }}>{s.short}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rr-md-crit">
              <div className="rr-md-crit-label">Actors</div>
              <div className="rr-pair-pickers">
                {window.ACTORS.map(a => {
                  const on = selected.criteria.actors.includes(a.id);
                  return (
                    <button key={a.id} className={"rr-pair-pick " + (on ? "is-on" : "")} onClick={() => toggleIn("actors", a.id)}>
                      <Avatar id={a.id} size={18} />
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rr-md-crit">
              <div className="rr-md-crit-label">Statuses</div>
              <div className="rr-pair-pickers">
                {[
                  { id: "scheduled", label: "scheduled", tone: "info" },
                  { id: "active",    label: "in flight", tone: "ok"   },
                  { id: "done",      label: "done",      tone: "neutral" },
                  { id: "blocked",   label: "blocked",   tone: "danger" },
                  { id: "failed",    label: "failed",    tone: "danger" },
                ].map(s => {
                  const on = selected.criteria.statuses.includes(s.id);
                  return (
                    <button key={s.id} className={"rr-prod-pick " + (on ? "is-on" : "")} onClick={() => toggleIn("statuses", s.id)}>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Resulting query</div>
            <div className="rr-md-query">
              <code>{filterToQuery(selected)}</code>
            </div>
          </div>
        </div>
      )}
    />
  );
};

function filterSummary(f) {
  const parts = [];
  if (f.criteria.products.length) parts.push(f.criteria.products.length + " product" + (f.criteria.products.length>1?"s":""));
  if (f.criteria.types.length)    parts.push(f.criteria.types.length + " type" + (f.criteria.types.length>1?"s":""));
  if (f.criteria.stages.length)   parts.push(f.criteria.stages.length + " stage" + (f.criteria.stages.length>1?"s":""));
  if (f.criteria.actors.length)   parts.push(f.criteria.actors.length + " actor" + (f.criteria.actors.length>1?"s":""));
  if (f.criteria.statuses.length) parts.push(f.criteria.statuses.length + " status" + (f.criteria.statuses.length>1?"es":""));
  return parts.length ? parts.join(" · ") : "no restrictions";
}
function filterToQuery(f) {
  const bits = [];
  if (f.criteria.products.length) bits.push("product:" + f.criteria.products.join(","));
  if (f.criteria.types.length)    bits.push("type:" + f.criteria.types.join(","));
  if (f.criteria.stages.length)   bits.push("stage:" + f.criteria.stages.join(","));
  if (f.criteria.actors.length)   bits.push("actor:" + f.criteria.actors.join(","));
  if (f.criteria.statuses.length) bits.push("status:" + f.criteria.statuses.join(","));
  return bits.length ? bits.join(" AND ") : "*";
}
function defaultStageDescription(key) {
  return ({
    "non-prod": "Internal test cluster. Used as the first stage of every cascade.",
    "prod1":    "Frankfurt-am-Main production. Carries ~60% of EU traffic.",
    "prod2":    "Zeus production. EU failover region.",
  })[key] || "";
}
function defaultStageRegion(key) {
  return ({
    "non-prod": "Internal",
    "prod1":    "Frankfurt-am-Main",
    "prod2":    "Zeus",
  })[key] || "—";
}

// ============================================================
// Actors
// ============================================================
const ActorsEditor = () => {
  const [actors, setActors] = mdUseState(() => window.ACTORS.map(a => ({
    ...a,
    email: a.id + "@tms-platform.example",
    department: "IT-DA-EXT",
  })));
  const [selectedId, setSelectedId] = mdUseState(actors[0]?.id);
  const selected = actors.find(a => a.id === selectedId);
  const update = (patch) => setActors(prev => prev.map(a => a.id === selectedId ? { ...a, ...patch } : a));
  const add = () => {
    const id = "actor-" + Date.now();
    const next = { id, name: "New Actor", initials: "NA", hue: 220, role: "readonly", email: "", department: "" };
    setActors(prev => [...prev, next]); setSelectedId(id);
  };
  const remove = (id) => {
    setActors(prev => {
      const next = prev.filter(a => a.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={actors}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New actor"
      renderListItem={(a) => (
        <>
          <Avatar id={a.id} size={28} />
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">{a.name}</div>
            <div className="rr-md-list-meta">
              <span className="rr-role-pill">{a.role}</span>
              <span className="rr-md-list-sep">·</span>
              <span>{a.department}</span>
            </div>
          </div>
        </>
      )}
      renderDetail={() => (
        <div className="rr-md-detail-inner">
          <header className="rr-md-detail-head">
            <div className="rr-md-detail-head-l">
              <Avatar id={selected.id} size={44} ring />
              <div>
                <div className="rr-md-detail-eyebrow">ACTOR · <span className="rr-mono">{selected.id}</span></div>
                <h2>{selected.name}</h2>
              </div>
            </div>
            <div className="rr-md-detail-head-r">
              <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={() => remove(selected.id)}>
                <Icon d={ICONS.x} size={12} /> Delete
              </button>
            </div>
          </header>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Profile</div>
            <div className="rr-form-grid">
              <label className="rr-field">
                <span>Display name</span>
                <input value={selected.name} onChange={e => update({ name: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Initials</span>
                <input value={selected.initials} onChange={e => update({ initials: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} />
              </label>
              <label className="rr-field">
                <span>Email</span>
                <input type="email" value={selected.email} onChange={e => update({ email: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Department</span>
                <input value={selected.department} onChange={e => update({ department: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Role</span>
                <select value={selected.role} onChange={e => update({ role: e.target.value })}>
                  <option value="admin">admin (can execute rollouts)</option>
                  <option value="readonly">readonly (view + comment only)</option>
                </select>
              </label>
              <label className="rr-field">
                <span>Avatar hue ({selected.hue}°)</span>
                <input type="range" min="0" max="360" value={selected.hue} onChange={e => update({ hue: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        </div>
      )}
    />
  );
};

// ============================================================
// Locks editor (full CRUD, replaces inline lock list eventually)
// ============================================================
const LocksEditor = () => {
  const [locks, setLocks] = mdUseState(() => window.LOCKS_RAW.map(l => ({ ...l })));
  const [selectedId, setSelectedId] = mdUseState(locks[0]?.id);
  const selected = locks.find(l => l.id === selectedId);
  const update = (patch) => setLocks(prev => prev.map(l => l.id === selectedId ? { ...l, ...patch } : l));
  const add = () => {
    const id = "lock-" + Date.now();
    const next = { id, title: "New lock", description: "", contact: "—", startOffset: 0, endOffset: 0, products: ["all"], kind: "manual" };
    setLocks(prev => [...prev, next]); setSelectedId(id);
  };
  const remove = (id) => {
    setLocks(prev => {
      const next = prev.filter(l => l.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  return (
    <MDMasterDetail
      items={locks}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={add}
      addLabel="New lock"
      renderListItem={(l) => (
        <>
          <span className={"rr-md-list-sq rr-lock-" + l.kind} />
          <div className="rr-md-list-body">
            <div className="rr-md-list-name">{l.title}</div>
            <div className="rr-md-list-meta">
              <span className="rr-mono">{l.kind}</span>
              <span className="rr-md-list-sep">·</span>
              <span>{l.products.includes("all") ? "all products" : l.products.join(", ")}</span>
            </div>
          </div>
        </>
      )}
      renderDetail={() => (
        <div className="rr-md-detail-inner">
          <header className="rr-md-detail-head">
            <div className="rr-md-detail-head-l">
              <span className={"rr-md-detail-lockicon rr-lock-" + selected.kind}>
                <Icon d={ICONS.lock} size={16} />
              </span>
              <div>
                <div className="rr-md-detail-eyebrow">LOCK · <span className="rr-mono">{selected.id}</span></div>
                <h2>{selected.title}</h2>
              </div>
            </div>
            <div className="rr-md-detail-head-r">
              <button className="rr-btn rr-btn-ghost rr-btn-sm rr-btn-danger-ghost" onClick={() => remove(selected.id)}>
                <Icon d={ICONS.x} size={12} /> Delete
              </button>
            </div>
          </header>

          <div className="rr-md-section">
            <div className="rr-md-section-title">Details</div>
            <div className="rr-form-grid">
              <label className="rr-field rr-field-wide">
                <span>Title</span>
                <input value={selected.title} onChange={e => update({ title: e.target.value })} />
              </label>
              <label className="rr-field rr-field-wide">
                <span>Description</span>
                <textarea rows={2} value={selected.description} onChange={e => update({ description: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Kind</span>
                <select value={selected.kind} onChange={e => update({ kind: e.target.value })}>
                  <option value="manual">Manual (e.g. master bug)</option>
                  <option value="holiday">Holiday</option>
                  <option value="window">Custom window</option>
                </select>
              </label>
              <label className="rr-field">
                <span>Contact</span>
                <input value={selected.contact} onChange={e => update({ contact: e.target.value })} />
              </label>
              <label className="rr-field">
                <span>Start offset (days from today)</span>
                <input type="number" value={selected.startOffset} onChange={e => update({ startOffset: Number(e.target.value) })} />
              </label>
              <label className="rr-field">
                <span>End offset (days from today)</span>
                <input type="number" value={selected.endOffset} onChange={e => update({ endOffset: Number(e.target.value) })} />
              </label>
              <div className="rr-field rr-field-wide">
                <span>Affected products</span>
                <div className="rr-prod-pickers">
                  <button className={"rr-prod-pick " + (selected.products.includes("all") ? "is-on" : "")}
                          onClick={() => update({ products: ["all"] })}>all</button>
                  {window.PRODUCTS.map(p => {
                    const on = selected.products.includes(p.id);
                    return (
                      <button key={p.id} className={"rr-prod-pick " + (on ? "is-on" : "")}
                              onClick={() => {
                                if (selected.products.includes("all")) return update({ products: [p.id] });
                                update({ products: on ? selected.products.filter(x => x !== p.id) : [...selected.products, p.id] });
                              }}>
                        <span className="rr-prod-dot" style={{ background: window.productColor(p.id) }} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    />
  );
};

// ============================================================
// Defaults / seed helpers
// ============================================================
function defaultProductDescription(id) {
  return ({
    operator:      "Solace + Oracle operator. Manages broker lifecycle and per-tenant configuration on the TMS platform.",
    concentrator:  "TLS-terminating gateway in front of every broker pair.",
    monalesy:      "Tenant-facing monitoring + analytics dashboard.",
    microservices: "Collection of small TMS-SSP services (frontend, appluser, monitoring, eks-info, …).",
  })[id] || "";
}
function defaultRepo(id) {
  return ({
    operator:      "git@github.example/tms-platform/operator",
    concentrator:  "git@github.example/tms-platform/concentrator",
    monalesy:      "git@github.example/tms-platform/monalesy",
    microservices: "git@github.example/tms-platform/microservices",
  })[id] || "";
}
function defaultRunbook(id) {
  return "https://docs.example/runbooks/" + id;
}
function defaultPairFor(id) {
  return ({
    operator:      ["luc", "hen"],
    concentrator:  ["mira", "tomas"],
    monalesy:      ["ravi"],
    microservices: ["luc", "ravi"],
  })[id] || [];
}
function defaultTypesFor(id) {
  return ({
    operator:      ["operator-feature", "operator-hf"],
    concentrator:  ["concentrator-mod"],
    monalesy:      ["monalesy-feature", "monalesy-patch"],
    microservices: ["tms-ssp-nc", "tms-ssp-c", "tms-ssp-hf"],
  })[id] || [];
}

Object.assign(window, { MasterDataView, LocksEditor });

const LocksOnlyView = ({ onCreateLock }) => (
  <div className="rr-md">
    <div className="rr-md-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div>
        <h1 className="rr-md-title">Locks</h1>
        <p className="rr-md-sub">Rollout-Sperren that block scheduling and execution. Friday-rule locks are automatic; the entries below are explicit manual or holiday locks.</p>
      </div>
    </div>
    <div className="rr-md-body">
      <LocksEditor />
    </div>
  </div>
);
window.LocksOnlyView = LocksOnlyView;
