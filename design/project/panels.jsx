// ============================================================
// ReleaseRadar — Execute panel + Create modals
// ============================================================

// ---------- Execute Rollout (drawer OR full page, controlled by mode prop) ----------
const ExecutePanel = ({ rollout, onClose, locks, onUpdate, mode = "drawer", onOpenFullPage }) => {
  if (!rollout) return null;
  const isPage = mode === "page";
  const type = window.getType(rollout.typeId);
  const product = window.getProduct(rollout.product);

  // Find blocking lock(s)
  const blockingLocks = locks.filter(l =>
    (l.products.includes("all") || l.products.includes(rollout.product)) &&
    rollout.stages.some(st => {
      const d = window.addDays(window.TODAY, st.offset);
      const ls = window.addDays(window.TODAY, l.startOffset);
      const le = window.addDays(window.TODAY, l.endOffset);
      return d >= ls && d <= le;
    })
  );

  const [taskStates, setTaskStates] = useState(() => {
    const init = {};
    (rollout.checked || []).forEach(i => { init[i] = { status: "done" }; });
    return init;
  });
  const [failingTask, setFailingTask] = useState(null); // task index whose reason input is open
  const [reasonDraft, setReasonDraft] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState(rollout.announcementText || rollout.descExt || "");
  const [risks, setRisks] = useState(rollout.risks);
  const [descExt, setDescExt] = useState(rollout.descExt);
  const [descInt, setDescInt] = useState(rollout.descInt);

  const taskLog = {
    0: { by: "luc",  at: "09:54" },
    1: { by: "hen",  at: "10:02" },
    2: { by: "luc",  at: "10:11" },
    3: { by: "hen",  at: "10:14" },
  };

  const setDone = (i) => {
    setTaskStates(s => {
      const n = { ...s };
      if (n[i] && n[i].status === "done") delete n[i];
      else n[i] = { status: "done" };
      return n;
    });
    if (failingTask === i) { setFailingTask(null); setReasonDraft(""); }
  };

  const setFailed = (i) => {
    const existing = taskStates[i];
    if (existing && existing.status === "failed") {
      // un-fail: clear
      setTaskStates(s => { const n = { ...s }; delete n[i]; return n; });
      if (failingTask === i) setFailingTask(null);
      return;
    }
    setFailingTask(i);
    setReasonDraft(existing && existing.reason ? existing.reason : "");
  };

  const saveReason = (i) => {
    const reason = reasonDraft.trim();
    if (!reason) return;
    setTaskStates(s => ({ ...s, [i]: { status: "failed", reason } }));
    setFailingTask(null);
    setReasonDraft("");
  };

  const doneCount   = Object.values(taskStates).filter(t => t.status === "done").length;
  const failedCount = Object.values(taskStates).filter(t => t.status === "failed").length;
  const failedTasks = Object.entries(taskStates)
    .filter(([_, v]) => v.status === "failed")
    .map(([k, v]) => ({ i: Number(k), reason: v.reason }));
  const completion = Math.round((doneCount / type.tasks.length) * 100);

  const [copied, setCopied] = useState(false);
  const shareLink = window.location.origin + window.location.pathname + "#rollout/" + rollout.id;
  const copyLink = () => {
    try {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {}
  };

  const headerActions = (
    <div className="rr-drawer-head-r">
      {!isPage && (
        <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={onOpenFullPage} title="Open full page">
          <Icon d={ICONS.link} size={13} /> Open
        </button>
      )}
      {isPage && (
        <button className={"rr-btn rr-btn-ghost rr-btn-sm " + (copied ? "is-on-ghost" : "")} onClick={copyLink}>
          <Icon d={copied ? ICONS.check : ICONS.link} size={13} />
          {copied ? "Link copied" : "Copy link"}
        </button>
      )}
      <button className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.copy} size={13} /> Duplicate</button>
      <button className="rr-btn rr-btn-ghost rr-btn-sm"><Icon d={ICONS.download} size={13} /> .ics</button>
      <button className="rr-btn rr-btn-primary rr-btn-sm">Execute next step</button>
      {!isPage && <button className="rr-icon-btn" onClick={onClose}><Icon d={ICONS.x} size={14} /></button>}
    </div>
  );

  const head = (
    <header className={isPage ? "rr-detail-head" : "rr-drawer-head"}>
      <div className="rr-drawer-head-l">
        {isPage && (
          <button className="rr-detail-back" onClick={onClose}>
            <Icon d={ICONS.chev} size={12} className="rr-rot-180" /> Back to timeline
          </button>
        )}
        <div className="rr-drawer-eyebrow">
          <span className="rr-prod-dot" style={{ background: window.productColor(rollout.product) }} />
          <span>{product.name}</span>
          <span className="rr-sep">/</span>
          <Badge tone={type.tone}>{type.short}</Badge>
          <span className="rr-sep">/</span>
          <span className="rr-mono rr-muted">{rollout.id}</span>
        </div>
        <h2 className="rr-drawer-title">{rollout.title}</h2>
        {isPage && (
          <div className="rr-detail-sharebar">
            <Icon d={ICONS.link} size={11} />
            <code>{shareLink}</code>
            <span className="rr-detail-sharebar-hint">share this URL — it deep-links straight to this rollout</span>
          </div>
        )}
      </div>
      {headerActions}
    </header>
  );

  const lockBanner = blockingLocks.length > 0 && (
    <div className="rr-banner rr-banner-danger">
      <Icon d={ICONS.warn} size={18} />
      <div>
        <strong>Lock Active — Do not deploy.</strong>
        <p>
          {blockingLocks.map(l => l.title).join(" • ")}.{" "}
          {blockingLocks[0].description}
        </p>
      </div>
      <button className="rr-banner-action">Acknowledge</button>
    </div>
  );

  const inner = (
    <>
      {head}
      {lockBanner}
        <div className="rr-drawer-grid">
          {/* LEFT — stages + checklist */}
          <div className="rr-drawer-col">
            {/* Stage cascade summary */}
            <section className="rr-block">
              <div className="rr-block-head">
                <h3>Cascade</h3>
                <span className="rr-block-sub">{type.announce}</span>
              </div>
              <div className="rr-stage-cards">
                {rollout.stages.map((st, i) => {
                  const s = STAGE[st.env];
                  const d = window.addDays(window.TODAY, st.offset);
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <div className="rr-stage-arrow">
                          <span>+{rollout.stages[i].offset - rollout.stages[i-1].offset}d</span>
                          <Icon d="M5 12h14m0 0l-4-4m4 4l-4 4" size={14} />
                        </div>
                      )}
                      <div className="rr-stage-card" style={{ borderColor: s.border, background: s.soft }}>
                        <div className="rr-stage-card-top">
                          <span className="rr-stage-card-tag" style={{ background: s.color, color: "#0a0a0c" }}>{s.short}</span>
                          <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
                        </div>
                        <div className="rr-stage-card-date">
                          {d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
                          <span> · {st.time}</span>
                        </div>
                        <div className="rr-stage-card-status">
                          <span className={"rr-pill-dot is-" + st.status} />
                          {st.status}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </section>

            {/* Tasks */}
            <section className="rr-block">
              <div className="rr-block-head">
                <h3>Tasks <span className="rr-muted">(inherited from {type.short})</span></h3>
                <div className="rr-progress-wrap">
                  <div className="rr-progress">
                    <div className="rr-progress-fill" style={{ width: completion + "%" }} />
                    {failedCount > 0 && (
                      <div className="rr-progress-fail" style={{ width: (failedCount / type.tasks.length) * 100 + "%" }} />
                    )}
                  </div>
                  <span className="rr-mono">{completion}%</span>
                  {failedCount > 0 && <span className="rr-mono rr-fail-count">· {failedCount} failed</span>}
                </div>
              </div>

              {failedCount > 0 && (
                <div className="rr-fail-banner">
                  <div className="rr-fail-banner-l">
                    <Icon d={ICONS.warn} size={16} />
                    <div>
                      <strong>{failedCount} task{failedCount > 1 ? "s" : ""} failed.</strong>
                      <p>You can continue the rollout (the failure is logged) or reschedule — this rollout will be marked <em>failed</em> and a copy created for a new slot.</p>
                    </div>
                  </div>
                  <div className="rr-fail-banner-r">
                    <button className="rr-btn rr-btn-ghost rr-btn-sm">Continue anyway</button>
                    <button className="rr-btn rr-btn-primary rr-btn-sm" onClick={() => setRescheduleOpen(true)}>
                      <Icon d={ICONS.copy} size={12} /> Reschedule
                    </button>
                  </div>
                </div>
              )}

              <ul className="rr-tasks">
                {type.tasks.map((t, i) => {
                  const state = taskStates[i];
                  const isDone   = state && state.status === "done";
                  const isFailed = state && state.status === "failed";
                  const isFailing = failingTask === i;
                  const log = isDone
                    ? (taskLog[i] || { by: rollout.pair[i % rollout.pair.length], at: "10:" + String(20 + i*4).padStart(2,"0") })
                    : null;
                  return (
                    <li key={i} className={"rr-task " + (isDone ? "is-done " : "") + (isFailed ? "is-failed " : "") + (isFailing ? "is-failing" : "")}>
                      <div className="rr-task-main">
                        <div className="rr-task-checks">
                          <button
                            className={"rr-check rr-check-ok " + (isDone ? "is-on" : "")}
                            onClick={() => setDone(i)}
                            aria-pressed={isDone}
                            title="Mark done"
                          >
                            {isDone && <Icon d={ICONS.check} size={11} />}
                          </button>
                          <button
                            className={"rr-check rr-check-fail " + (isFailed ? "is-on" : "")}
                            onClick={() => setFailed(i)}
                            aria-pressed={isFailed}
                            title="Mark failed"
                          >
                            {isFailed && <Icon d={ICONS.x} size={11} />}
                          </button>
                        </div>
                        <span className="rr-task-label">{t}</span>
                        {log && (
                          <span className="rr-task-log">
                            <Avatar id={log.by} size={16} />
                            <span>checked by {window.getActor(log.by).name} · {log.at}</span>
                          </span>
                        )}
                        {isFailed && !isFailing && (
                          <span className="rr-task-log">
                            <Avatar id={rollout.pair[i % rollout.pair.length]} size={16} />
                            <span>failed · {window.getActor(rollout.pair[i % rollout.pair.length]).name} · 10:{String(30 + i*3).padStart(2,"0")}</span>
                          </span>
                        )}
                        {!log && !isFailed && !isFailing && (
                          <span className="rr-task-pending">pending</span>
                        )}
                      </div>

                      {isFailed && !isFailing && (
                        <div className="rr-task-reason">
                          <Icon d={ICONS.warn} size={11} />
                          <span className="rr-task-reason-text">{state.reason}</span>
                          <button className="rr-task-reason-edit" onClick={() => { setFailingTask(i); setReasonDraft(state.reason); }}>edit</button>
                        </div>
                      )}

                      {isFailing && (
                        <div className="rr-task-reason-form">
                          <label className="rr-field">
                            <span>Why did this step fail? <em>(required — will be logged on this rollout and the reschedule copy)</em></span>
                            <textarea
                              rows={2}
                              autoFocus
                              placeholder="e.g. broker diff returned 14 unexpected drift entries on zeus-02 — investigate before retry."
                              value={reasonDraft}
                              onChange={e => setReasonDraft(e.target.value)}
                            />
                          </label>
                          <div className="rr-task-reason-actions">
                            <button className="rr-btn rr-btn-ghost rr-btn-sm" onClick={() => { setFailingTask(null); setReasonDraft(""); }}>Cancel</button>
                            <button className="rr-btn rr-btn-danger rr-btn-sm" onClick={() => saveReason(i)} disabled={!reasonDraft.trim()}>
                              Save failure
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button className="rr-task-add"><Icon d={ICONS.plus} size={12} /> Add custom task</button>
            </section>

            {/* Descriptions */}
            <section className="rr-block">
              <div className="rr-block-head"><h3>Descriptions &amp; Risks</h3></div>
              <div className="rr-fields">
                <label className="rr-field">
                  <span>External description <em>(customer-visible)</em></span>
                  <textarea rows={2} value={descExt} onChange={e => setDescExt(e.target.value)} />
                </label>
                <label className="rr-field">
                  <span>Internal description</span>
                  <textarea rows={2} value={descInt} onChange={e => setDescInt(e.target.value)} />
                </label>
                <label className="rr-field rr-field-announce">
                  <span>
                    <span className="rr-field-label-row">
                      Description in the announcement
                      <span className="rr-field-pill"><Icon d={ICONS.bolt} size={10} /> sent to <code>TMS_PROD</code></span>
                    </span>
                    <em>injected into the channel template as <code>{`{{rollout.announcementText}}`}</code> — seeded from the external description</em>
                  </span>
                  <textarea rows={3} value={announcementText} onChange={e => setAnnouncementText(e.target.value)} />
                  <div className="rr-field-helpers">
                    <button className="rr-link" onClick={() => setAnnouncementText(descExt)}>
                      <Icon d={ICONS.copy} size={11} /> Reset from external description
                    </button>
                    <span className="rr-field-count rr-mono">{announcementText.length} chars</span>
                  </div>
                </label>
                <label className="rr-field">
                  <span>Risks</span>
                  <textarea rows={2} value={risks} onChange={e => setRisks(e.target.value)} />
                </label>
              </div>
            </section>
          </div>

          {/* RIGHT — pair, rules, brokers */}
          <div className="rr-drawer-col rr-drawer-col-right">
            <section className="rr-block">
              <div className="rr-block-head"><h3>Executed by (pair)</h3></div>
              <div className="rr-pair">
                {rollout.pair.map(id => {
                  const a = window.getActor(id);
                  return (
                    <div key={id} className="rr-pair-card">
                      <Avatar id={id} size={36} ring />
                      <div>
                        <div className="rr-pair-name">{a.name}</div>
                        <div className="rr-pair-role"><span className="rr-role-pill">{a.role}</span> · oAuth verified</div>
                      </div>
                    </div>
                  );
                })}
                {rollout.pair.length === 1 && (
                  <button className="rr-pair-add">
                    <Icon d={ICONS.plus} size={14} /> Add second actor
                    <span className="rr-pair-add-hint">Pair required for this rollout type</span>
                  </button>
                )}
              </div>
            </section>

            <section className="rr-block">
              <div className="rr-block-head"><h3>RolloutType rules</h3></div>
              <ul className="rr-rules">
                {type.rules.map((r, i) => (
                  <li key={i}><Icon d={ICONS.check} size={12} /> {r}</li>
                ))}
              </ul>
            </section>

            <section className="rr-block">
              <div className="rr-block-head"><h3>Announcements</h3></div>
              <ul className="rr-announce">
                <li><Badge tone="ok" dot>sent</Badge> <span>TMS_NP · 1d ahead</span><span className="rr-mono rr-muted">Mon 09:00</span></li>
                <li><Badge tone="ok" dot>sent</Badge> <span>TMS_PROD · 1w ahead (prod1)</span><span className="rr-mono rr-muted">Mon 09:01</span></li>
                <li><Badge tone="warn" dot>queued</Badge> <span>TMS_PROD · 2w ahead (prod2)</span><span className="rr-mono rr-muted">in 3d</span></li>
              </ul>
            </section>
          </div>
        </div>

        {rescheduleOpen && (
          <RescheduleConfirm
            rollout={rollout}
            failedTasks={failedTasks}
            taskNames={type.tasks}
            onCancel={() => setRescheduleOpen(false)}
            onConfirm={() => setRescheduleOpen(false)}
          />
        )}
    </>
  );

  if (isPage) {
    return <div className="rr-detail-page">{inner}</div>;
  }
  return (
    <div className="rr-drawer-scrim" onClick={onClose}>
      <aside className="rr-drawer" onClick={e => e.stopPropagation()}>
        {inner}
      </aside>
    </div>
  );
};

// ---------- Reschedule confirm modal (copy + mark failed) ----------
const RescheduleConfirm = ({ rollout, failedTasks, taskNames, onCancel, onConfirm }) => {
  const tomorrowISO = new Date(window.TODAY.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const [newDate, setNewDate] = useState(tomorrowISO);
  const [newTime, setNewTime] = useState("10:00");
  const [extraNote, setExtraNote] = useState("");

  return (
    <div className="rr-modal-scrim" onClick={onCancel}>
      <div className="rr-modal rr-modal-sm" onClick={e => e.stopPropagation()}>
        <header className="rr-modal-head">
          <div>
            <h2>Reschedule rollout</h2>
            <p className="rr-modal-sub">
              This rollout will be marked <strong style={{ color: "#fca5a5" }}>failed</strong> with the recorded reasons.
              A copy will be created with all current data, ready to schedule for a new slot.
            </p>
          </div>
          <button className="rr-icon-btn" onClick={onCancel}><Icon d={ICONS.x} size={14} /></button>
        </header>

        <div className="rr-modal-body">
          <div className="rr-resched-summary">
            <div className="rr-resched-eyebrow">Will be marked failed</div>
            <div className="rr-resched-title">{rollout.title}</div>
            <ul className="rr-resched-reasons">
              {failedTasks.map(f => (
                <li key={f.i}>
                  <Icon d={ICONS.x} size={11} />
                  <span><strong>{taskNames[f.i]}</strong> — {f.reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rr-resched-arrow">
            <Icon d="M12 5v14m0 0l-5-5m5 5l5-5" size={16} />
            <span>becomes a new rollout</span>
          </div>

          <div className="rr-form-grid">
            <label className="rr-field">
              <span>New non-prod date</span>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </label>
            <label className="rr-field">
              <span>Time</span>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
            </label>
            <label className="rr-field rr-field-wide">
              <span>Add context to the new rollout <em>(optional)</em></span>
              <textarea
                rows={2}
                placeholder="e.g. retry after broker diff cleanup on zeus-02"
                value={extraNote}
                onChange={e => setExtraNote(e.target.value)}
              />
            </label>
          </div>

          <div className="rr-resched-inherit">
            <Icon d={ICONS.check} size={12} />
            <span>Pair, descriptions, risks, brokers, announcements &amp; tasks are copied. Cascade re-anchors from the new non-prod date.</span>
          </div>
        </div>

        <footer className="rr-modal-foot">
          <span className="rr-muted">A new rollout-id will be issued; both entries stay linked.</span>
          <div className="rr-modal-foot-actions">
            <button className="rr-btn rr-btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="rr-btn rr-btn-primary" onClick={onConfirm}>
              <Icon d={ICONS.copy} size={12} /> Mark failed &amp; create copy
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

// ---------- Create Rollout modal ----------
const CreateRolloutModal = ({ open, onClose }) => {
  const [productId, setProductId] = useState("operator");
  const [typeId, setTypeId]       = useState("operator-feature");
  const [start, setStart]         = useState("2026-06-03");
  const [time, setTime]           = useState("10:00");
  const [pair, setPair]           = useState(["luc", "hen"]);
  const [descExt, setDescExt]     = useState("");
  const [descInt, setDescInt]     = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [risks, setRisks]         = useState("");

  if (!open) return null;
  const type = window.getType(typeId);

  return (
    <div className="rr-modal-scrim" onClick={onClose}>
      <div className="rr-modal" onClick={e => e.stopPropagation()}>
        <header className="rr-modal-head">
          <div>
            <h2>Create rollout</h2>
            <p className="rr-modal-sub">Inherits TODOs, announcement rules, and cascade delays from the chosen RolloutType.</p>
          </div>
          <button className="rr-icon-btn" onClick={onClose}><Icon d={ICONS.x} size={14} /></button>
        </header>

        <div className="rr-modal-body">
          <div className="rr-form-grid">
            <label className="rr-field">
              <span>Product</span>
              <select value={productId} onChange={e => setProductId(e.target.value)}>
                {window.PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="rr-field">
              <span>Rollout type</span>
              <select value={typeId} onChange={e => setTypeId(e.target.value)}>
                {window.ROLLOUT_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="rr-field">
              <span>Start (non-prod)</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="rr-field">
              <span>Time</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </label>
          </div>

          {/* dynamic hint — based on selected RolloutType */}
          <div className="rr-hint">
            <div className="rr-hint-icon"><Icon d={ICONS.bolt} size={14} /></div>
            <div className="rr-hint-body">
              <div className="rr-hint-title">{type.name}</div>
              <div className="rr-hint-sub">{type.announce}</div>
              {(type.cascadePlan && type.cascadePlan.length > 1) && (
                <div className="rr-cascade-preview">
                  <CascadePreview start={start} time={time} type={type} />
                </div>
              )}
              <ul className="rr-hint-rules">
                {type.rules.map((r, i) => <li key={i}><Icon d={ICONS.check} size={11} /> {r}</li>)}
              </ul>
            </div>
          </div>

          {/* Inherited tasks preview */}
          <div className="rr-block-head"><h3>Inherited tasks <span className="rr-muted">({type.tasks.length})</span></h3></div>
          <ul className="rr-tasks-preview">
            {type.tasks.map((t, i) => (
              <li key={i}><span className="rr-mono rr-muted">{String(i+1).padStart(2,"0")}</span> {t}</li>
            ))}
          </ul>

          <div className="rr-form-grid">
            <label className="rr-field rr-field-wide">
              <span>External description</span>
              <textarea rows={2} placeholder="Customer-visible summary…" value={descExt} onChange={e => setDescExt(e.target.value)} />
            </label>
            <label className="rr-field rr-field-wide">
              <span>Internal description</span>
              <textarea rows={2} placeholder="Internal context, runbook links, migration notes…" value={descInt} onChange={e => setDescInt(e.target.value)} />
            </label>
            <label className="rr-field rr-field-wide rr-field-announce">
              <span>
                <span className="rr-field-label-row">
                  Description in the announcement
                  <span className="rr-field-pill"><Icon d={ICONS.bolt} size={10} /> sent to <code>TMS_PROD</code></span>
                </span>
                <em>shown to customers in the channel announcement. Defaults to the external description if left empty.</em>
              </span>
              <textarea rows={3}
                placeholder="If empty, the external description is used. Edit here to override the announcement text without affecting the rollout description."
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)} />
              <div className="rr-field-helpers">
                <button type="button" className="rr-link" onClick={() => setAnnouncementText(descExt)}>
                  <Icon d={ICONS.copy} size={11} /> Copy from external description
                </button>
                <span className="rr-field-count rr-mono">{announcementText.length} chars</span>
              </div>
            </label>
            <label className="rr-field rr-field-wide">
              <span>Risks</span>
              <textarea rows={2} placeholder={(type.cascadePlan?.length || 0) > 1 ? "What can go wrong during cascade?" : "Known risks…"} value={risks} onChange={e => setRisks(e.target.value)} />
            </label>
          </div>

          <div className="rr-form-grid">
            <div className="rr-field rr-field-wide">
              <span>Executed by (pair)</span>
              <div className="rr-pair-pickers">
                {window.ACTORS.filter(a => a.role === "admin").map(a => {
                  const on = pair.includes(a.id);
                  return (
                    <button key={a.id}
                            className={"rr-pair-pick " + (on ? "is-on" : "")}
                            onClick={() => setPair(p => on ? p.filter(x => x !== a.id) : (p.length < 2 ? [...p, a.id] : [p[1], a.id]))}>
                      <Avatar id={a.id} size={20} />
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <footer className="rr-modal-foot">
          <span className="rr-muted">An <code>.ics</code> entry will be added to the team's Cal-DAV feed.</span>
          <div className="rr-modal-foot-actions">
            <button className="rr-btn rr-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="rr-btn rr-btn-primary" onClick={onClose}>Create rollout</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const CascadePreview = ({ start, time, type }) => {
  const startD = new Date(start + "T" + time);
  const plan = type.cascadePlan || [{ stage: "non-prod", delayHours: 0 }];
  const stages = plan.map(p => ({
    env: p.stage,
    hours: p.delayHours,
    d: new Date(startD.getTime() + (p.delayHours || 0) * 3600000),
  }));
  return (
    <div className="rr-cp">
      {stages.map((s, i) => {
        const st = STAGE[s.env] || window.fallbackStage(s.env);
        const t = s.d.toTimeString().slice(0,5);
        return (
          <React.Fragment key={i}>
            <div className="rr-cp-card" style={{ borderColor: st.border, background: st.soft }}>
              <span className="rr-cp-tag" style={{ background: st.color, color: "#0a0a0c" }}>{st.short}</span>
              <div>
                <div className="rr-cp-env" style={{ color: st.color }}>{st.label}</div>
                <div className="rr-cp-date">
                  {s.d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
                  <span> · {t}</span>
                </div>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="rr-cp-arrow">
                <span>+{window.formatDelay(stages[i+1].hours - stages[i].hours)}</span>
                <Icon d="M5 12h14m0 0l-4-4m4 4l-4 4" size={14} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------- Create Lock modal ----------
const CreateLockModal = ({ open, onClose }) => {
  const [kind, setKind] = useState("manual");
  const [products, setProducts] = useState(["all"]);
  if (!open) return null;
  return (
    <div className="rr-modal-scrim" onClick={onClose}>
      <div className="rr-modal rr-modal-sm" onClick={e => e.stopPropagation()}>
        <header className="rr-modal-head">
          <div>
            <h2>Create rollout lock (Sperre)</h2>
            <p className="rr-modal-sub">Blocked time range — no rollouts can be scheduled or executed.</p>
          </div>
          <button className="rr-icon-btn" onClick={onClose}><Icon d={ICONS.x} size={14} /></button>
        </header>

        <div className="rr-modal-body">
          <div className="rr-seg rr-seg-lg">
            {[{id:"manual", label:"Manual (master bug)"}, {id:"holiday", label:"Holiday"}, {id:"window", label:"Custom window"}].map(o => (
              <button key={o.id} className={"rr-seg-item " + (kind === o.id ? "is-active" : "")} onClick={() => setKind(o.id)}>{o.label}</button>
            ))}
          </div>

          <div className="rr-form-grid">
            <label className="rr-field"><span>Start</span><input type="datetime-local" defaultValue="2026-05-27T17:00" /></label>
            <label className="rr-field"><span>End</span><input type="datetime-local" defaultValue="2026-05-29T09:00" /></label>
            <label className="rr-field rr-field-wide"><span>Title</span><input placeholder="e.g. Master Branch Bug #4029" /></label>
            <label className="rr-field rr-field-wide">
              <span>Description</span>
              <textarea rows={2} placeholder="Why is this a lock? What needs to clear before it's lifted?" />
            </label>
            <label className="rr-field"><span>Customer / contact</span><input placeholder="Luc B. — #tms-platform" /></label>
            <label className="rr-field">
              <span>Affected products</span>
              <div className="rr-prod-pickers">
                <button className={"rr-prod-pick " + (products.includes("all") ? "is-on" : "")}
                        onClick={() => setProducts(["all"])}>all</button>
                {window.PRODUCTS.map(p => {
                  const on = products.includes(p.id);
                  return (
                    <button key={p.id} className={"rr-prod-pick " + (on ? "is-on" : "")}
                            onClick={() => setProducts(prev => {
                              if (prev.includes("all")) return [p.id];
                              return on ? prev.filter(x => x !== p.id) : [...prev, p.id];
                            })}>
                      <span className="rr-prod-dot" style={{ background: window.productColor(p.id) }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>
        </div>

        <footer className="rr-modal-foot">
          <span className="rr-muted">Locks are visible in the timeline as red striped columns.</span>
          <div className="rr-modal-foot-actions">
            <button className="rr-btn rr-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="rr-btn rr-btn-danger" onClick={onClose}>Create lock</button>
          </div>
        </footer>
      </div>
    </div>
  );
};

Object.assign(window, { ExecutePanel, CreateRolloutModal, CreateLockModal });
