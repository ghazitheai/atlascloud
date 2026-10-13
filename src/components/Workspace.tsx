"use client";
import { useEffect, useMemo, useState } from "react";
type Row = Record<string, any>;
type Data = Record<string, any>;
type Dialog = { kind: string; target?: Row };
const nav = [
  ["dashboard", "◫", "Overview", "نظرة عامة"],
  ["requisitions", "▤", "Requisitions", "طلبات الشراء"],
  ["approvals", "✓", "Approvals", "الموافقات"],
  ["rfqs", "◷", "Sourcing & RFQs", "طلبات عروض الأسعار"],
  ["orders", "▣", "Purchase orders", "أوامر الشراء"],
  ["vendors", "◇", "Supplier directory", "دليل الموردين"],
  ["catalog", "▦", "Product catalog", "دليل المنتجات"],
  ["inventory", "▧", "Inventory", "المخزون"],
  ["invoices", "≡", "Invoice matching", "مطابقة الفواتير"],
  ["contracts", "⌁", "Contracts & performance", "العقود والأداء"],
  ["reports", "↗", "Reports", "التقارير"],
  ["audit", "◎", "Activity & administration", "السجل والإدارة"],
];
const vendorNav = [
  ["dashboard", "◫", "Portal overview", "نظرة عامة"],
  ["rfqs", "◷", "Invitations & quotes", "الدعوات والعروض"],
  ["orders", "▣", "Your orders", "أوامر الشراء"],
];
const good = [
  "APPROVED",
  "MATCHED",
  "PAID",
  "RECEIVED",
  "DELIVERED",
  "ACCEPTED",
  "ACKNOWLEDGED",
  "AWARDED",
];
const pending = [
  "PENDING",
  "DRAFT",
  "OPEN",
  "SUBMITTED",
  "PARTIAL",
  "PARTIALLY_PAID",
  "QUEUED",
  "EVALUATION",
];
function Pill({ value }: { value: string }) {
  return (
    <span
      className={
        "pill " +
        (good.includes(value)
          ? "green"
          : pending.includes(value)
            ? "amber"
            : [
                  "EXCEPTION",
                  "REJECTED",
                  "BLOCKED",
                  "FAILED",
                  "SUSPENDED",
                ].includes(value)
              ? "red"
              : "")
      }
    >
      {value?.replaceAll("_", " ")}
    </span>
  );
}
const amount = (n: any, currency?: string) =>
  new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(n ?? 0)) + (currency ? " " + currency : "");
function Table({
  headers,
  rows,
  empty = "No records yet. Create your first record to get started.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">{empty}</div>}
    </div>
  );
}
function Panel({
  title,
  children,
  extra,
}: {
  title: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
function Kpi({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  note: string;
  icon: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span>{title}</span>
        <span className="kpi-symbol">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
async function api(path: string, body?: unknown, key?: string) {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? undefined
        : {
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok)
    throw new Error(
      b.error +
        (b.details
          ? "\n" +
            b.details.map((d: Row) => d.field + ": " + d.message).join("\n")
          : ""),
    );
  return b;
}
function csv(name: string, rows: Row[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter(
    (k) => typeof rows[0][k] !== "object",
  );
  const cell = (v: any) => {
    let text = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.map(cell).join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "atlas-" + name + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
export default function Workspace() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState("dashboard");
  const [entityId, setEntity] = useState("all");
  const [query, setQuery] = useState("");
  const [rtl, setRtl] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [comparison, setComparison] = useState<Row | null>(null);
  const [doc, setDoc] = useState<Row | null>(null);
  async function load() {
    try {
      setData(await api("workspace"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace");
    }
  }
  useEffect(() => {
    load();
    const saved = localStorage.getItem("atlas-locale");
    if (saved === "ar") setRtl(true);
  }, []);
  useEffect(() => {
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = rtl ? "ar" : "en";
    localStorage.setItem("atlas-locale", rtl ? "ar" : "en");
  }, [rtl]);
  const v = !!data?.actor.vendorId;
  const role = data?.actor.role;
  const buyer = ["GROUP_ADMIN", "ENTITY_ADMIN", "BUYER"].includes(role);
  const requester = buyer || role === "REQUESTER";
  const approver = ["GROUP_ADMIN", "ENTITY_ADMIN", "APPROVER"].includes(role);
  const receiving = ["GROUP_ADMIN", "ENTITY_ADMIN", "WAREHOUSE"].includes(role);
  const finance = ["GROUP_ADMIN", "ENTITY_ADMIN", "FINANCE"].includes(role);
  const admin = ["GROUP_ADMIN", "ENTITY_ADMIN"].includes(role);
  const list = (key: string) =>
    (data?.[key] ?? []).filter(
      (r: Row) =>
        (entityId === "all" || !r.entityId || r.entityId === entityId) &&
        (!query ||
          JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),
    );
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const key of [
      "products",
      "vendors",
      "entities",
      "warehouses",
      "departments",
    ])
      for (const r of data?.[key] ?? []) m.set(r.id, r.name);
    return m;
  }, [data]);
  const name = (id: string) => names.get(id) ?? id;
  const product = (id: string) =>
    (data?.products ?? []).find((p: Row) => p.id === id);
  const date = (d: string) =>
    new Date(d).toLocaleDateString(rtl ? "ar-EG" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  async function action(path: string, body: unknown = {}, key?: string) {
    try {
      const b = await api(path, body, key);
      await load();
      setToast("Saved successfully");
      setTimeout(() => setToast(""), 3500);
      return b;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      throw e;
    }
  }
  async function compare(r: Row) {
    try {
      setComparison(await api("rfqs/" + r.id + "/comparison"));
      setPage("comparison");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot open comparison");
    }
  }
  async function orderDoc(r: Row) {
    try {
      setDoc(await api("orders/" + r.id + "/document"));
      setPage("document");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot load document");
    }
  }
  function button(text: string, fn: () => unknown, secondary = true) {
    return (
      <button
        className={secondary ? "secondary small" : "small"}
        onClick={() => {
          Promise.resolve(fn()).catch(() => {});
        }}
      >
        {text}
      </button>
    );
  }
  function open(kind: string, target?: Row) {
    setDialog({ kind, target });
  }
  const rfqs = list("rfqs"),
    orders = list("orders"),
    reqs = list("requisitions"),
    invoices = list("invoices"),
    approvals = list("approvals");
  const title =
    (v ? vendorNav : nav).find((n) => n[0] === page)?.[rtl ? 3 : 2] ??
    (page === "comparison"
      ? "Quotation comparison"
      : page === "document"
        ? "Purchase order document"
        : "Workspace");
  if (!data)
    return (
      <main className="content">
        <div className="brand">◈ ATLAS</div>
        <p className="muted">Loading your workspace…</p>
        {error && <p className="error">{error}</p>}
      </main>
    );
  const pendingApprovals = approvals.filter((r: Row) => r.status === "PENDING");
  const low = list("inventory").filter((r: Row) => r.low);
  const deadlines = rfqs.filter((r: Row) => r.status === "OPEN");
  const tableReq = (rows: Row[]) =>
    rows.map((r) => [
      <>
        <strong>{r.reference}</strong>
        <small>{name(r.departmentId)}</small>
      </>,
      r.justification,
      date(r.requiredAt),
      <Pill value={r.status} />,
      <div className="actions">
        {requester &&
          ["DRAFT", "RETURNED"].includes(r.status) &&
          button("Submit", () => action("requisitions/" + r.id + "/submit"))}
        {buyer &&
          r.status === "APPROVED" &&
          button("Create RFQ", () => open("rfq", r))}
        {requester &&
          ["DRAFT", "RETURNED", "APPROVED", "SUBMITTED"].includes(r.status) &&
          button("Revise", () => open("revise", r))}
        {button("Details", () => open("details", r))}
      </div>,
    ]);
  const tableOrders = (rows: Row[]) =>
    rows.map((r) => [
      <>
        <strong>{r.reference}</strong>
        <small>{name(r.entityId)}</small>
      </>,
      name(r.vendorId),
      amount(r.total, r.currency),
      date(r.dueAt),
      <Pill value={r.status} />,
      <div className="actions">
        {v &&
          r.status === "ISSUED" &&
          button("Acknowledge", () =>
            action("orders/" + r.id + "/acknowledge"),
          )}
        {receiving &&
          ["ISSUED", "ACKNOWLEDGED", "PARTIAL"].includes(r.status) &&
          button("Receive", () => open("receipt", r))}
        {finance && button("Invoice", () => open("invoice", r))}
        {button("View PO", () => orderDoc(r))}
      </div>,
    ]);
  const exportRows =
    page === "catalog"
      ? list("products")
      : page === "inventory"
        ? list("inventory")
        : page === "reports"
          ? list("budgets")
          : page === "audit"
            ? list("audits")
            : page === "vendors"
              ? list("vendors")
              : page === "contracts"
                ? list("contracts")
                : list(page);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          ◈ ATLAS<small>PROCUREMENT CLOUD</small>
        </div>
        <div className="nav-label">
          {v ? "SUPPLIER WORKSPACE" : "WORKSPACE"}
        </div>
        <nav>
          {(v ? vendorNav : nav).map(([key, icon, en, ar]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => {
                setPage(key);
                setQuery("");
                setComparison(null);
                setDoc(null);
              }}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-text">{rtl ? ar : en}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <strong>{data.actor.name}</strong>
          {role?.replaceAll("_", " ")}
          <br />
          <br />
          {v ? data.vendor?.name : "Connected procurement operations"}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <input
            aria-label="Search current workspace"
            className="search"
            placeholder={
              rtl ? "ابحث في مساحة العمل…" : "⌕  Search this workspace…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="top-tools">
            <select
              aria-label="Legal entity filter"
              value={entityId}
              onChange={(e) => setEntity(e.target.value)}
            >
              <option value="all">All legal entities</option>
              {data.entities.map((e: Row) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button className="secondary small" onClick={() => setRtl(!rtl)}>
              {rtl ? "EN" : "عربي"}
            </button>
            <span className="avatar">{data.actor.name.slice(0, 1)}</span>
            <button
              className="secondary small"
              onClick={async () => {
                await api("auth/logout", {});
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-header">
            <div>
              <span className="eyebrow">
                {v ? "VENDOR PORTAL" : "PROCUREMENT OPERATIONS"} /{" "}
                {entityId === "all" ? "GROUP VIEW" : name(entityId)}
              </span>
              <h1>
                {page === "dashboard"
                  ? rtl
                    ? "كل قرارات الشراء، في مكان واحد."
                    : v
                      ? "Your supplier workspace"
                      : "Every purchase, in perspective."
                  : title}
              </h1>
              <p className="muted">
                {page === "dashboard"
                  ? "Your priorities, commitments and supply chain at a glance."
                  : "Review records, take action and track the full history."}
              </p>
            </div>
            <div className="header-actions">
              {page === "requisitions" &&
                requester &&
                button("+ New requisition", () => open("requisition"), false)}
              {page === "vendors" &&
                buyer &&
                button("+ Add supplier", () => open("vendor"), false)}
              {page === "catalog" &&
                buyer &&
                button("+ Supplier mapping", () => open("mapping"), false)}
              {page === "inventory" &&
                receiving &&
                button("+ Stock movement", () => open("stock"), false)}
              {!["dashboard", "comparison", "document"].includes(page) &&
                button("↓ Export CSV", () => csv(page, exportRows))}
              {button("↻ Refresh", load)}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="secondary small"
                style={{ float: "right" }}
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          )}
          {v && data.blocked && (
            <div className="banner">
              Your supplier profile is awaiting qualification or has been
              restricted. Contact the procurement team for review.
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="kpi-grid">
                <Kpi
                  title={v ? "Open invitations" : "Open requisitions"}
                  value={
                    v
                      ? deadlines.length
                      : reqs.filter(
                          (r: Row) =>
                            !["FULFILLED", "CANCELLED", "REJECTED"].includes(
                              r.status,
                            ),
                        ).length
                  }
                  note={
                    v
                      ? "Submit before the stated deadline"
                      : "Requests moving through the purchasing workflow"
                  }
                  icon="▤"
                />
                <Kpi
                  title={v ? "Submitted quotations" : "Awaiting approval"}
                  value={v ? list("quotes").length : pendingApprovals.length}
                  note={
                    v
                      ? "Versioned offers, preserved on submission"
                      : "Requisitions and awards requiring a decision"
                  }
                  icon="✓"
                />
                <Kpi
                  title="Active purchase orders"
                  value={
                    orders.filter((o: Row) => o.status !== "RECEIVED").length
                  }
                  note="Issued, acknowledged and partial deliveries"
                  icon="▣"
                />
                <Kpi
                  title={v ? "Completed deliveries" : "Inventory alerts"}
                  value={
                    v
                      ? orders.filter((o: Row) => o.status === "RECEIVED")
                          .length
                      : low.length
                  }
                  note={
                    v
                      ? "Orders received by the buying team"
                      : "Product / warehouse pairs at reorder point"
                  }
                  icon="▧"
                />
              </div>
              <Panel
                title="Procurement journey"
                extra={<span className="pill green">DATABASE CONNECTED</span>}
              >
                <div className="workflow">
                  {[
                    ["Request", reqs.length],
                    ["Approval", approvals.length],
                    ["RFQ", rfqs.length],
                    ["Order", orders.length],
                    ["Receipt", list("receipts").length],
                    ["Invoice", invoices.length],
                  ].map(([label, count], i) => (
                    <div className="stage" key={label}>
                      <b>{i + 1}</b>
                      {label}
                      <small>{count} records</small>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="two-col">
                <div>
                  <Panel
                    title={v ? "Your recent orders" : "Purchasing activity"}
                    extra={button("View all →", () => setPage("orders"))}
                  >
                    <Table
                      headers={[
                        "Reference",
                        "Supplier",
                        "Value",
                        "Due",
                        "Status",
                        "Actions",
                      ]}
                      rows={tableOrders(orders.slice(0, 5))}
                    />
                  </Panel>
                  {!v && (
                    <Panel title="Budget position by legal entity">
                      <div className="panel-body">
                        {data.entities.map((e: Row) => {
                          const budgets = list("budgets").filter(
                            (b: Row) => b.entityId === e.id,
                          );
                          const total = budgets.reduce(
                              (n: number, b: Row) => n + Number(b.allocated),
                              0,
                            ),
                            used = budgets.reduce(
                              (n: number, b: Row) =>
                                n + Number(b.actual) + Number(b.committed),
                              0,
                            );
                          return (
                            <div className="bar-row" key={e.id}>
                              <span>{e.name}</span>
                              <div className="bar">
                                <span
                                  style={{
                                    width:
                                      Math.min(
                                        100,
                                        total ? (used / total) * 100 : 0,
                                      ) + "%",
                                  }}
                                />
                              </div>
                              <span>
                                {total ? Math.round((used / total) * 100) : 0}%
                                utilized
                              </span>
                            </div>
                          );
                        })}
                        <p className="footnote">
                          Commitments plus actual expenditure; each entity
                          retains its own currency. No cross-currency sum.
                        </p>
                      </div>
                    </Panel>
                  )}
                </div>
                <div>
                  <Panel title="Needs your attention">
                    <div className="panel-body">
                      {pendingApprovals.slice(0, 3).map((a: Row) => (
                        <div className="alert-row" key={a.id}>
                          <span className="alert-mark">✓</span>
                          <div>
                            <strong>
                              {a.targetType === "AWARD"
                                ? "Award approval"
                                : "Purchase request approval"}
                            </strong>
                            <p>
                              {name(a.entityId)} · {date(a.createdAt)}
                            </p>
                            {button("Review", () => setPage("approvals"))}
                          </div>
                        </div>
                      ))}
                      {deadlines.slice(0, 3).map((r: Row) => (
                        <div className="alert-row" key={r.id}>
                          <span className="alert-mark">◷</span>
                          <div>
                            <strong>{r.title}</strong>
                            <p>Submission deadline · {date(r.deadline)}</p>
                            {button("Open RFQ", () => setPage("rfqs"))}
                          </div>
                        </div>
                      ))}
                      {!pendingApprovals.length && !deadlines.length && (
                        <p className="muted">
                          You are up to date. New tasks will appear here.
                        </p>
                      )}
                    </div>
                  </Panel>
                  {!v && (
                    <Panel title="Integration status">
                      <div className="panel-body">
                        {Object.entries(data.integrationStatus).map(
                          ([k, value]) => (
                            <div key={k} style={{ marginBottom: 15 }}>
                              <span className="eyebrow">{k}</span>
                              <p
                                className="muted tiny"
                                style={{ marginTop: 6 }}
                              >
                                {String(value)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </Panel>
                  )}
                </div>
              </div>
            </>
          )}
          {page === "requisitions" && (
            <Panel title="Purchase requisitions">
              <Table
                headers={[
                  "Reference",
                  "Business justification",
                  "Required",
                  "Status",
                  "Actions",
                ]}
                rows={tableReq(reqs)}
              />
            </Panel>
          )}
          {page === "approvals" && (
            <>
              <div className="banner">
                Self-approval is blocked. Approval decisions apply to a specific
                transaction version; material revisions require a new decision.
              </div>
              <Panel title="Approval inbox">
                <Table
                  headers={[
                    "Transaction",
                    "Entity",
                    "Version",
                    "Requested",
                    "Status",
                    "Decision",
                  ]}
                  rows={approvals.map((r: Row) => [
                    <>
                      <strong>{r.targetType}</strong>
                      <small>{r.targetId}</small>
                    </>,
                    name(r.entityId),
                    "v" + r.targetVersion,
                    date(r.createdAt),
                    <Pill value={r.status} />,
                    <div className="actions">
                      {approver &&
                        r.status === "PENDING" &&
                        r.requesterId !== data.actor.id &&
                        button("Review decision", () => open("approval", r))}
                      {r.requesterId === data.actor.id && (
                        <small>Requires another approver</small>
                      )}
                      {r.reason && <small>{r.reason}</small>}
                    </div>,
                  ])}
                />
              </Panel>
            </>
          )}
          {page === "rfqs" && (
            <>
              <div className="banner">
                Sealed offers stay hidden until the submission deadline and bid
                opening. Submitted quotations are preserved as immutable
                versions.
              </div>
              <Panel title={v ? "Your RFQ invitations" : "Sourcing workspace"}>
                <Table
                  headers={[
                    "RFQ",
                    "Legal entity",
                    "Deadline",
                    "Responses",
                    "Status",
                    "Actions",
                  ]}
                  rows={rfqs.map((r: Row) => [
                    <>
                      <strong>
                        {r.reference} · v{r.version}
                      </strong>
                      <small>{r.title}</small>
                    </>,
                    name(r.entityId),
                    <>
                      {date(r.deadline)}
                      <br />
                      <small>
                        {new Date(r.deadline).toLocaleTimeString()} ·{" "}
                        {
                          data.entities.find((e: Row) => e.id === r.entityId)
                            ?.timezone
                        }
                      </small>
                    </>,
                    v
                      ? data.quotes.filter((q: Row) => q.rfqId === r.id)
                          .length + " versions"
                      : r.vendors.filter((x: Row) => x.status === "RESPONDED")
                          .length +
                        "/" +
                        r.vendors.length,
                    <Pill value={r.status} />,
                    <div className="actions">
                      {buyer &&
                        ["DRAFT", "OPEN"].includes(r.status) &&
                        button("Invite vendors", () => open("rfqInvite", r))}
                      {(buyer || v) &&
                        r.status === "OPEN" &&
                        button(
                          v ? "Submit quotation" : "Enter external offer",
                          () => open("quote", r),
                        )}
                      {v &&
                        r.acknowledgedVersion !== r.version &&
                        button("Acknowledge v" + r.version, () =>
                          action("rfqs/" + r.id + "/acknowledge"),
                        )}
                      {buyer &&
                        r.status === "OPEN" &&
                        button("Open bids", () =>
                          action("rfqs/" + r.id + "/open"),
                        )}
                      {buyer &&
                        ["DRAFT", "OPEN"].includes(r.status) &&
                        button("Amend", () => open("amend", r))}
                      {!v &&
                        ["EVALUATION", "AWARDED"].includes(r.status) &&
                        button("Compare offers", () => compare(r))}
                      {button("Details", () => open("details", r))}
                    </div>,
                  ])}
                />
              </Panel>
              {v && (
                <Panel title="Your quotation history">
                  <Table
                    headers={[
                      "RFQ",
                      "Version",
                      "Currency",
                      "Freight",
                      "Submitted",
                      "Status",
                    ]}
                    rows={list("quotes").map((q: Row) => [
                      rfqs.find((r: Row) => r.id === q.rfqId)?.reference,
                      "v" + q.version,
                      q.currency,
                      amount(q.freight, q.currency),
                      date(q.createdAt),
                      <Pill value={q.status} />,
                    ])}
                  />
                </Panel>
              )}
            </>
          )}
          {page === "comparison" && comparison && (
            <>
              <div className="banner">
                Compare delivered costs in the entity currency using recorded
                exchange rates. Every split award charges the supplier’s full
                quoted freight once. A reason is required for the selection.
              </div>
              <Panel
                title={comparison.rfq.reference + " · " + comparison.rfq.title}
                extra={
                  buyer && comparison.rfq.status === "EVALUATION"
                    ? button(
                        "Propose award",
                        () => open("award", comparison),
                        false,
                      )
                    : null
                }
              >
                <div className="comparison-grid">
                  <table>
                    <thead>
                      <tr>
                        <th>Evaluation</th>
                        {comparison.offers.map((q: Row) => (
                          <th key={q.id}>
                            {q.vendor}
                            <br />
                            <Pill
                              value={q.eligible ? "APPROVED" : "EXCEPTION"}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "Score",
                          ...comparison.offers.map((q: Row) => (
                            <strong className="score">
                              {q.score.toFixed(2)}
                            </strong>
                          )),
                        ],
                        [
                          "Evaluation cost",
                          ...comparison.offers.map((q: Row) =>
                            amount(
                              q.evaluation,
                              data.entities.find(
                                (e: Row) => e.id === comparison.rfq.entityId,
                              )?.currency,
                            ),
                          ),
                        ],
                        [
                          "Payable total",
                          ...comparison.offers.map((q: Row) =>
                            amount(q.payable, q.currency),
                          ),
                        ],
                        [
                          "Freight / charges",
                          ...comparison.offers.map(
                            (q: Row) =>
                              amount(q.freight) +
                              " / " +
                              amount(q.otherCharges) +
                              " " +
                              q.currency,
                          ),
                        ],
                        [
                          "Lead time",
                          ...comparison.offers.map(
                            (q: Row) => q.leadDays + " days",
                          ),
                        ],
                        [
                          "Payment terms",
                          ...comparison.offers.map((q: Row) => q.paymentTerms),
                        ],
                        [
                          "FX snapshot",
                          ...comparison.offers.map((q: Row) => (
                            <>
                              {q.fxRate}
                              <br />
                              <small>
                                {q.fxSource} · {date(q.fxAt)}
                              </small>
                            </>
                          )),
                        ],
                        [
                          "Eligibility",
                          ...comparison.offers.map(
                            (q: Row) =>
                              q.reasons.join("; ") || "All requirements passed",
                          ),
                        ],
                        ...comparison.rfq.lines.map((l: Row) => [
                          <>
                            <strong>{name(l.productId)}</strong>
                            <small>
                              {amount(l.quantity)} {l.unit}
                            </small>
                          </>,
                          ...comparison.offers.map((q: Row) => {
                            const x = q.lines.find(
                              (x: Row) => x.rfqLineId === l.id,
                            );
                            return x ? (
                              <>
                                <strong>
                                  {amount(x.baseUnitPrice, q.currency)} /{" "}
                                  {l.unit}
                                </strong>
                                <small>
                                  Pack {Number(x.packFactor)} · MOQ{" "}
                                  {Number(x.moq)}
                                  <br />
                                  {x.deviation || "No technical deviation"}
                                </small>
                              </>
                            ) : (
                              "Missing line"
                            );
                          }),
                        ]),
                      ].map((cells, i) => (
                        <tr key={i}>
                          {cells.map((c: React.ReactNode, j: number) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!comparison.offers.length && (
                    <div className="empty">No submitted offers.</div>
                  )}
                </div>
              </Panel>
              <Panel title="Visible calculation formulas">
                <div className="panel-body">
                  {Object.entries(comparison.formulas).map(([key, value]) => (
                    <p className="muted tiny" key={key}>
                      <strong>{key}: </strong>
                      {String(value)}
                    </p>
                  ))}
                  {button("Export comparison", () =>
                    csv("comparison", comparison.offers),
                  )}
                </div>
              </Panel>
            </>
          )}
          {page === "orders" && (
            <Panel title="Purchase order register">
              <Table
                headers={[
                  "Reference",
                  "Supplier",
                  "Value",
                  "Due date",
                  "Status",
                  "Actions",
                ]}
                rows={tableOrders(orders)}
              />
            </Panel>
          )}
          {page === "document" && doc && (
            <>
              <div
                className="header-actions no-print"
                style={{ marginBottom: 20 }}
              >
                {button("Print / Save PDF", () => window.print(), false)}
                {button("← Back to orders", () => setPage("orders"))}
              </div>
              <article className="print-sheet">
                <div className="print-top">
                  <div>
                    <div className="brand">◈ ATLAS</div>
                    <p style={{ marginTop: 20 }}>
                      {doc.entity.name}
                      <br />
                      {doc.entity.country}
                    </p>
                  </div>
                  <div>
                    <h2>PURCHASE ORDER</h2>
                    <strong>{doc.po.reference}</strong>
                    <p className="muted">
                      Version {doc.po.version}
                      <br />
                      {date(doc.po.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="form-grid">
                  <div>
                    <span className="eyebrow">SUPPLIER</span>
                    <h3 style={{ marginTop: 12 }}>{doc.vendor.name}</h3>
                    <p className="muted">
                      {doc.vendor.email}
                      <br />
                      Tax ID: {doc.vendor.taxId ?? "Not provided"}
                    </p>
                  </div>
                  <div>
                    <span className="eyebrow">DELIVERY LOCATION</span>
                    <h3 style={{ marginTop: 12 }}>{doc.warehouse.name}</h3>
                    <p className="muted">
                      {doc.warehouse.location}
                      <br />
                      Required by {date(doc.po.dueAt)}
                    </p>
                  </div>
                </div>
                <Table
                  headers={[
                    "Item",
                    "Qty / base unit",
                    "Pack snapshot",
                    "Net unit price",
                    "VAT",
                    "Line total",
                  ]}
                  rows={doc.po.lines.map((l: Row) => [
                    doc.products.find((p: Row) => p.id === l.productId)?.name,
                    Number(l.quantity) + " " + l.unit,
                    Number(l.packFactor),
                    amount(l.unitPrice, doc.po.currency),
                    Number(l.taxPercent) + "%",
                    amount(
                      Number(l.quantity) *
                        Number(l.unitPrice) *
                        (1 + Number(l.taxPercent) / 100),
                      doc.po.currency,
                    ),
                  ])}
                />
                <div style={{ textAlign: "end", padding: 20 }}>
                  <p>Freight: {amount(doc.po.freight, doc.po.currency)}</p>
                  <p>
                    Other charges:{" "}
                    {amount(doc.po.otherCharges, doc.po.currency)}
                  </p>
                  <h2>Total: {amount(doc.po.total, doc.po.currency)}</h2>
                </div>
                <p className="muted">Payment terms: {doc.po.paymentTerms}</p>
                <p className="footnote">
                  Approved award {doc.po.awardId} · Approved{" "}
                  {doc.approval
                    ? date(doc.approval.decidedAt)
                    : "approval recorded in transaction history"}
                  <br />
                  This document reflects version {doc.po.version} of the
                  approved purchase order.
                </p>
              </article>
            </>
          )}
          {page === "vendors" && (
            <>
              <div className="banner">
                Supplier claims and internally verified records are kept
                separate. Product mappings below identify who supplies each item
                and in which country.
              </div>
              <div className="grid-cards">
                {list("vendors").map((r: Row) => (
                  <article className="vendor-card" key={r.id}>
                    <div className="vendor-head">
                      <span className="vendor-icon">
                        {r.name.slice(0, 2).toUpperCase()}
                      </span>
                      <Pill value={r.status} />
                    </div>
                    <h3>{r.name}</h3>
                    <p className="muted tiny">{r.email}</p>
                    <div>
                      {r.categories.map((c: string) => (
                        <span className="tag" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className="vendor-meta">
                      <span>{r.countries.join(" · ")}</span>
                      <span>{r.score}/100</span>
                    </div>
                    <p className="footnote">
                      {r.qualification} ·{" "}
                      {r.verifiedAt
                        ? "Verified " + date(r.verifiedAt)
                        : "Not verified"}
                      <br />
                      {r.paymentTerms}
                    </p>
                    <div className="actions">
                      {admin &&
                        button("Qualification", () => open("qualify", r))}
                      {buyer &&
                        button("Invite to portal", () =>
                          open("vendorInvite", r),
                        )}
                      {button("Supply mappings", () => {
                        setQuery(r.id);
                        setPage("catalog");
                      })}
                    </div>
                  </article>
                ))}
              </div>
              {!list("vendors").length && (
                <div className="empty">No suppliers match your search.</div>
              )}
            </>
          )}
          {page === "catalog" && (
            <>
              <Panel title="Product & service master">
                <Table
                  headers={[
                    "SKU / product",
                    "Category",
                    "Type",
                    "Unit conversion",
                    "Reorder / target",
                  ]}
                  rows={list("products").map((p: Row) => [
                    <>
                      <strong>{p.sku}</strong>
                      <small>{p.name}</small>
                    </>,
                    p.category,
                    p.kind,
                    "1 " +
                      p.purchaseUnit +
                      " = " +
                      Number(p.packFactor) +
                      " " +
                      p.baseUnit,
                    Number(p.reorderPoint) + " / " + Number(p.targetStock),
                  ])}
                />
              </Panel>
              <Panel title="Verified supplier-to-item relationships">
                <Table
                  headers={[
                    "Product",
                    "Supplier",
                    "Vendor SKU",
                    "Pack / MOQ",
                    "Price",
                    "Region / lead",
                    "Verified",
                  ]}
                  rows={list("mappings").map((m: Row) => [
                    name(m.productId),
                    name(m.vendorId),
                    m.vendorSku,
                    Number(m.packFactor) +
                      " " +
                      product(m.productId)?.baseUnit +
                      " / " +
                      Number(m.moq),
                    amount(m.price, m.currency),
                    m.country + " · " + m.leadDays + " days",
                    m.verifiedAt ? date(m.verifiedAt) : "Unverified",
                  ])}
                />
              </Panel>
            </>
          )}
          {page === "inventory" && (
            <>
              <div className="kpi-grid">
                <Kpi
                  title="Warehouse locations"
                  value={list("warehouses").length}
                  note="Entity-specific inventory"
                  icon="▧"
                />
                <Kpi
                  title="Low stock positions"
                  value={low.length}
                  note="Available stock ≤ reorder point"
                  icon="!"
                />
                <Kpi
                  title="Pending receipts"
                  value={
                    orders.filter((o: Row) => o.status !== "RECEIVED").length
                  }
                  note="Open purchase orders"
                  icon="↓"
                />
                <Kpi
                  title="Posted movements"
                  value={list("movements").length}
                  note="Append-only stock ledger"
                  icon="≡"
                />
              </div>
              <Panel title="Stock availability & reorder recommendations">
                <Table
                  headers={[
                    "Product",
                    "Warehouse",
                    "On hand",
                    "Reserved",
                    "Available",
                    "Quarantine",
                    "Incoming",
                    "Suggested buy / suppliers",
                  ]}
                  rows={list("inventory").map((r: Row) => [
                    <>
                      <strong>{r.sku}</strong>
                      <small>{r.name}</small>
                    </>,
                    r.warehouse,
                    Number(r.onHand),
                    Number(r.reserved),
                    <span style={{ color: r.low ? "#b7792a" : "inherit" }}>
                      {Number(r.available)} {r.unit}
                    </span>,
                    Number(r.quarantine),
                    Number(r.incoming),
                    <>
                      {r.low ? Number(r.recommendation) : "—"}
                      <br />
                      <small>
                        {r.supplierIds.map(name).join(", ") ||
                          "No eligible mapped supplier"}
                      </small>
                    </>,
                  ])}
                />
              </Panel>
              <Panel title="Movement history">
                <Table
                  headers={[
                    "Date",
                    "Product",
                    "Warehouse",
                    "Movement",
                    "Accepted Δ",
                    "Reserved Δ",
                    "Quarantine Δ",
                    "Reason",
                  ]}
                  rows={list("movements").map((r: Row) => [
                    date(r.createdAt),
                    name(r.productId),
                    name(r.warehouseId),
                    r.type,
                    Number(r.quantity),
                    Number(r.reservedDelta),
                    Number(r.quarantineDelta),
                    r.reason,
                  ])}
                />
              </Panel>
              <p className="footnote">
                Perpetual moving weighted-average valuation. Accepted stock
                excludes quarantine. Suggested buy = target stock − available −
                incoming; this is a threshold-based recommendation.
              </p>
            </>
          )}
          {page === "invoices" && (
            <>
              <div className="banner">
                Goods use three-way matching against accepted receipts. Services
                use two-way matching. Approval never records a payment; finance
                must record a confirmed bank transaction.
              </div>
              <Panel title="Accounts payable workspace">
                <Table
                  headers={[
                    "Invoice",
                    "Supplier / order",
                    "Total",
                    "Due",
                    "Match status",
                    "Exceptions / payments",
                  ]}
                  rows={invoices.map((r: Row) => [
                    <strong>{r.number}</strong>,
                    <>
                      {name(r.vendorId)}
                      <br />
                      <small>
                        {
                          orders.find((o: Row) => o.id === r.purchaseOrderId)
                            ?.reference
                        }
                      </small>
                    </>,
                    amount(r.total, r.currency),
                    date(r.dueAt),
                    <Pill value={r.status} />,
                    <>
                      {r.exceptions.length > 0 ? (
                        <span style={{ color: "#ac5a43" }}>
                          {r.exceptions.join("; ")}
                        </span>
                      ) : (
                        <span className="muted tiny">
                          Matched to approved order and receipts
                        </span>
                      )}
                      <br />
                      {r.payments.length > 0 && (
                        <small>{r.payments.length} confirmed payments</small>
                      )}
                      {finance &&
                        ["MATCHED", "PARTIALLY_PAID"].includes(r.status) && (
                          <div className="actions" style={{ marginTop: 8 }}>
                            {button("Record payment", () => open("payment", r))}
                          </div>
                        )}
                    </>,
                  ])}
                />
              </Panel>
            </>
          )}
          {page === "contracts" && (
            <>
              <Panel title="Contract register">
                <Table
                  headers={[
                    "Reference",
                    "Supplier",
                    "Coverage",
                    "Valid until",
                    "Ceiling",
                  ]}
                  rows={list("contracts").map((r: Row) => [
                    <>
                      <strong>{r.reference}</strong>
                      <small>{r.name}</small>
                    </>,
                    name(r.vendorId),
                    r.categories.join(", "),
                    date(r.validUntil),
                    amount(r.ceiling, r.currency),
                  ])}
                />
              </Panel>
              <Panel title="Supplier performance · observed transactions">
                <Table
                  headers={[
                    "Supplier",
                    "Orders",
                    "Fill rate",
                    "Rejected units",
                    "Verified score",
                  ]}
                  rows={list("performance").map((r: Row) => [
                    r.name,
                    r.orders,
                    r.fillRate === null ? "No data" : r.fillRate + "%",
                    Number(r.rejectedUnits),
                    r.verifiedScore + "/100",
                  ])}
                />
              </Panel>
              <p className="footnote">
                Fill rate = cumulative accepted units / ordered units in
                accessible entities. Rejected units are attempted delivery
                units. Verified scores are manually qualified, separate from
                observed metrics.
              </p>
            </>
          )}
          {page === "reports" && (
            <>
              <Panel title="Budget utilization">
                <Table
                  headers={[
                    "Budget",
                    "Entity",
                    "Currency",
                    "Allocated",
                    "Committed",
                    "Actual",
                    "Available",
                  ]}
                  rows={list("budgets").map((r: Row) => [
                    r.name,
                    name(r.entityId),
                    r.currency,
                    amount(r.allocated),
                    amount(r.committed),
                    amount(r.actual),
                    amount(
                      Number(r.allocated) -
                        Number(r.committed) -
                        Number(r.actual),
                    ),
                  ])}
                />
              </Panel>
              <Panel title="RFQ response rates">
                <Table
                  headers={[
                    "RFQ",
                    "Invited",
                    "Responded",
                    "Response rate",
                    "Deadline",
                  ]}
                  rows={rfqs.map((r: Row) => [
                    r.reference,
                    r.vendors?.length ?? 0,
                    r.vendors?.filter((x: Row) => x.status === "RESPONDED")
                      .length ?? 0,
                    r.vendors?.length
                      ? Math.round(
                          (r.vendors.filter(
                            (x: Row) => x.status === "RESPONDED",
                          ).length /
                            r.vendors.length) *
                            100,
                        ) + "%"
                      : "—",
                    date(r.deadline),
                  ])}
                />
              </Panel>
              <Panel title="Spend by entity / supplier · matched invoices only">
                <Table
                  headers={["Entity", "Supplier", "Currency", "Invoiced value"]}
                  rows={(
                    Object.values(
                      invoices
                        .filter((i: Row) => i.status !== "EXCEPTION")
                        .reduce((acc: Record<string, Row>, i: Row) => {
                          const key = i.entityId + i.vendorId + i.currency;
                          acc[key] ??= {
                            entityId: i.entityId,
                            vendorId: i.vendorId,
                            currency: i.currency,
                            total: 0,
                          };
                          acc[key].total += Number(i.total);
                          return acc;
                        }, {}),
                    ) as Row[]
                  ).map((r: Row) => [
                    name(r.entityId),
                    name(r.vendorId),
                    r.currency,
                    amount(r.total),
                  ])}
                />
              </Panel>
              <p className="footnote">
                Group reporting preserves original currencies. CSV exports can
                be opened in Excel. No savings baseline is assumed.
              </p>
            </>
          )}
          {page === "audit" && (
            <>
              <Panel title="Delivery & retry log">
                <Table
                  headers={["Task", "Status", "Attempts", "Created", "Result"]}
                  rows={list("jobs").map((r: Row) => [
                    r.type,
                    <Pill value={r.status} />,
                    r.attempts,
                    date(r.createdAt),
                    r.lastError ??
                      (r.deliveredAt
                        ? "Accepted by configured SMTP server"
                        : "Waiting for worker"),
                  ])}
                />
              </Panel>
              <Panel title="Vendor onboarding invitations">
                <Table
                  headers={["Supplier", "Contact", "Status", "Expiry"]}
                  rows={list("invitations").map((r: Row) => [
                    name(r.vendorId),
                    r.email,
                    <Pill value={r.status} />,
                    date(r.expiresAt),
                  ])}
                />
              </Panel>
              <Panel title="Audit trail">
                <div>
                  {list("audits").map((r: Row) => (
                    <div className="audit-item" key={r.id}>
                      <span className="dot" />
                      <div>
                        <strong>
                          {r.action.replaceAll("_", " ")} · {r.targetType}
                        </strong>
                        <p>{r.reason}</p>
                        <time>
                          {date(r.createdAt)} · Actor {r.actorId} · {r.targetId}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Documents">
                <Table
                  headers={["Name", "Type", "Size", "Scan status"]}
                  rows={list("documents").map((r: Row) => [
                    r.name,
                    r.contentType,
                    Math.round(r.size / 1024) + " KB",
                    <Pill value={r.scanStatus} />,
                  ])}
                />
              </Panel>
              <p className="footnote">
                Recent activity only: up to 200 audit events, 500 stock
                movements and 100 jobs. Production database grants protect audit
                and ledger records from update/delete by the runtime account.
              </p>
            </>
          )}
          <p className="footnote">
            ATLAS PROCUREMENT ·{" "}
            {v
              ? "Supplier access is restricted to your organization."
              : "Records are filtered to your authorized tenant and legal entities."}
          </p>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      {dialog && (
        <ActionDialog
          dialog={dialog}
          data={data}
          preferredEntity={entityId}
          close={() => setDialog(null)}
          onAction={action}
          names={names}
        />
      )}
    </div>
  );
}
function ActionDialog({
  dialog,
  data,
  preferredEntity,
  close,
  onAction,
  names,
}: {
  dialog: Dialog;
  data: Data;
  preferredEntity: string;
  close: () => void;
  onAction: (path: string, body?: unknown, key?: string) => Promise<any>;
  names: Map<string, string>;
}) {
  const k = dialog.kind,
    t = dialog.target ?? {};
  const isVendor = !!data.actor.vendorId;
  const entity =
    (preferredEntity !== "all" ? preferredEntity : data.entities[0]?.id) ?? "";
  const defaults: Row = {
    entityId: entity,
    departmentId:
      data.departments?.find((x: Row) => x.entityId === entity)?.id ?? "",
    warehouseId:
      data.warehouses?.find((x: Row) => x.entityId === entity)?.id ?? "",
    budgetId: data.budgets?.find((x: Row) => x.entityId === entity)?.id ?? "",
    justification: t.justification ?? "",
    requiredAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    title: t.title ?? "Office replenishment",
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    sealed: true,
    decision: "APPROVED",
    reason: "",
    currency:
      data.entities.find((x: Row) => x.id === (t.entityId ?? entity))
        ?.currency ?? "EGP",
    fxRate: "1",
    fxSource: "Entity base currency",
    fxAt: new Date().toISOString().slice(0, 16),
    freight: "0",
    otherCharges: "0",
    paymentTerms: "Net 30",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
    leadDays: 3,
    vendorId:
      data.vendors?.find((v: Row) =>
        t.vendors?.some((x: Row) => x.vendorId === v.id),
      )?.id ??
      data.vendors?.[0]?.id ??
      "",
    source: "EMAIL",
    status: "APPROVED",
    countries: "EG, AE, GB",
    currencies: "EGP, AED, GBP",
    categories: "Office supplies",
    deliveryAreas: "Cairo",
    name: "",
    email: "",
    taxId: "",
    productId: data.products[0]?.id ?? "",
    type: "ISSUE",
    quantity: "1",
    number: "",
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
    amount: "",
    reference: "",
    paidAt: new Date().toISOString().slice(0, 16),
    terms: t.terms ?? "Net 30",
    unit: "pack",
    packFactor: "1",
    price: "0",
    moq: "1",
    country: "EG",
    vendorSku: "",
  };
  const [form, setForm] = useState<Row>(defaults);
  const [lines, setLines] = useState<Row[]>(() => {
    if (["receipt", "invoice"].includes(k))
      return t.lines.map((l: Row) => ({
        purchaseOrderLineId: l.id,
        productId: l.productId,
        quantity: String(Math.max(0, Number(l.quantity) - Number(l.received))),
        accepted: "0",
        rejected: "0",
        reason: "Inspection accepted",
        unitPrice: l.unitPrice,
      }));
    if (k === "quote")
      return t.lines.map((l: Row) => ({
        rfqLineId: l.id,
        productId: l.productId,
        offeredQuantity: String(l.quantity),
        packFactor: "1",
        unitPrice: "0",
        discountPercent: "0",
        taxPercent: "0",
        taxRecoverable: false,
        moq: "1",
        compliant: true,
        deviation: "",
      }));
    if (k === "award")
      return t.rfq.lines.map((l: Row) => {
        const offer = t.offers.find((q: Row) =>
          q.lines.some((x: Row) => x.rfqLineId === l.id && x.eligible),
        );
        return {
          rfqLineId: l.id,
          productId: l.productId,
          quoteLineId:
            offer?.lines.find((x: Row) => x.rfqLineId === l.id)?.quoteLineId ??
            "",
          quantity: l.quantity,
        };
      });
    if (k === "revise")
      return t.lines.map((l: Row) => ({
        productId: l.productId,
        quantity: l.quantity,
        estimatedUnitPrice: l.estimatedUnitPrice,
        specifications: l.specifications,
      }));
    return [
      {
        productId: data.products[0]?.id ?? "",
        quantity: "1",
        estimatedUnitPrice: "0",
        specifications: "",
      },
    ];
  });
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postingKey] = useState(() => crypto.randomUUID());
  const set = (key: string, value: unknown) =>
    setForm((f) => {
      if (key === "entityId") {
        const entity = data.entities.find((e: Row) => e.id === value);
        return {
          ...f,
          entityId: value,
          departmentId:
            data.departments?.find((d: Row) => d.entityId === value)?.id ?? "",
          warehouseId:
            data.warehouses?.find((w: Row) => w.entityId === value)?.id ?? "",
          budgetId:
            data.budgets?.find((b: Row) => b.entityId === value)?.id ?? "",
          currency: entity?.currency ?? f.currency,
          country: entity?.country ?? f.country,
        };
      }
      return { ...f, [key]: value };
    });
  const lineSet = (i: number, key: string, value: unknown) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  const option = (rows: Row[], label = "name") =>
    rows.map((r) => ({ value: r.id, label: r[label] }));
  function field(
    key: string,
    label: string,
    type = "text",
    options?: { value: string; label: string }[],
    line?: number,
  ) {
    const val = line === undefined ? form[key] : lines[line][key];
    const update = (v: unknown) =>
      line === undefined ? set(key, v) : lineSet(line, key, v);
    return (
      <label key={key}>
        {label}
        {options ? (
          <select
            required
            value={val ?? ""}
            onChange={(e) => update(e.target.value)}
          >
            {options.length === 0 && (
              <option value="">No available records</option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "checkbox" ? (
          <input
            style={{ width: "auto", marginLeft: 12 }}
            type="checkbox"
            checked={!!val}
            onChange={(e) => update(e.target.checked)}
          />
        ) : type === "textarea" ? (
          <textarea
            required
            rows={3}
            value={val ?? ""}
            onChange={(e) => update(e.target.value)}
          />
        ) : (
          <input
            required={key !== "specifications"}
            type={type}
            step={type === "number" ? "any" : undefined}
            min={type === "number" ? 0 : undefined}
            value={val ?? ""}
            onChange={(e) => update(e.target.value)}
          />
        )}
      </label>
    );
  }
  const iso = (s: string) => new Date(s).toISOString();
  const arr = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let path = "",
        body: unknown = {};
      if (k === "requisition") {
        path = "requisitions";
        body = {
          entityId: form.entityId,
          departmentId: form.departmentId,
          warehouseId: form.warehouseId,
          budgetId: form.budgetId || undefined,
          justification: form.justification,
          requiredAt: iso(form.requiredAt),
          lines,
        };
      }
      if (k === "revise") {
        path = "requisitions/" + t.id + "/revise";
        body = { justification: form.justification, lines };
      }
      if (k === "rfq") {
        path = "rfqs";
        body = {
          requisitionId: t.id,
          title: form.title,
          deadline: iso(form.deadline),
          sealed: form.sealed,
        };
      }
      if (k === "rfqInvite") {
        path = "rfqs/" + t.id + "/invite";
        body = { vendorIds };
      }
      if (k === "approval") {
        path = "approvals/" + t.id + "/decide";
        body = { decision: form.decision, reason: form.reason };
      }
      if (k === "amend") {
        path = "rfqs/" + t.id + "/amend";
        body = {
          deadline: iso(form.deadline),
          terms: form.terms,
          reason: form.reason,
        };
      }
      if (k === "quote") {
        path = "rfqs/" + t.id + "/quotes";
        body = {
          vendorId: isVendor ? undefined : form.vendorId,
          currency: form.currency,
          fxRate: form.fxRate,
          fxSource: form.fxSource,
          fxAt: iso(form.fxAt),
          freight: form.freight,
          otherCharges: form.otherCharges,
          paymentTerms: form.paymentTerms,
          validUntil: iso(form.validUntil),
          leadDays: Number(form.leadDays),
          source: isVendor ? "PORTAL" : form.source,
          lines: lines.map(({ productId, ...rest }) => rest),
        };
      }
      if (k === "award") {
        path = "rfqs/" + t.rfq.id + "/award";
        body = {
          reason: form.reason,
          lines: lines.map((l) => ({
            quoteLineId: l.quoteLineId,
            quantity: l.quantity,
          })),
        };
      }
      if (k === "receipt") {
        path = "orders/" + t.id + "/receive";
        body = {
          lines: lines
            .filter((l) => Number(l.accepted) + Number(l.rejected) > 0)
            .map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId,
              accepted: l.accepted,
              rejected: l.rejected,
              reason: l.reason,
            })),
        };
      }
      if (k === "invoice") {
        path = "orders/" + t.id + "/invoices";
        body = {
          number: form.number,
          dueAt: iso(form.dueAt),
          freight: form.freight,
          otherCharges: form.otherCharges,
          lines: lines
            .filter((l) => Number(l.quantity) > 0)
            .map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
        };
      }
      if (k === "payment") {
        path = "invoices/" + t.id + "/payments";
        body = {
          amount: form.amount,
          reference: form.reference,
          paidAt: iso(form.paidAt),
          source: "MANUAL_BANK_CONFIRMATION",
        };
      }
      if (k === "vendor") {
        path = "vendors";
        body = {
          name: form.name,
          email: form.email,
          countries: arr(form.countries),
          currencies: arr(form.currencies),
          categories: arr(form.categories),
          deliveryAreas: arr(form.deliveryAreas),
          taxId: form.taxId,
        };
      }
      if (k === "qualify") {
        path = "vendors/" + t.id + "/qualify";
        body = { status: form.status, reason: form.reason };
      }
      if (k === "vendorInvite") {
        path = "vendors/" + t.id + "/invite";
        body = { entityId: form.entityId };
      }
      if (k === "stock") {
        path = "stock";
        body = {
          entityId: form.entityId,
          warehouseId: form.warehouseId,
          productId: form.productId,
          type: form.type,
          quantity: form.quantity,
          reason: form.reason,
        };
      }
      if (k === "mapping") {
        path = "supplier-items";
        body = {
          vendorId: form.vendorId,
          productId: form.productId,
          vendorSku: form.vendorSku,
          unit: form.unit,
          packFactor: form.packFactor,
          price: form.price,
          currency: form.currency,
          moq: form.moq,
          leadDays: Number(form.leadDays),
          country: form.country,
        };
      }
      if (!path) throw new Error("No action selected");
      await onAction(path, body, k === "receipt" ? postingKey : undefined);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    requisition: "Create purchase requisition",
    revise: "Revise requisition",
    rfq: "Create sourcing request",
    rfqInvite: "Invite qualified suppliers",
    approval: "Review approval",
    quote: "Submit quotation",
    award: "Propose a supplier award",
    receipt: "Post goods receipt",
    invoice: "Capture vendor invoice",
    payment: "Record confirmed payment",
    vendor: "Add supplier",
    qualify: "Supplier qualification",
    vendorInvite: "Invite supplier to portal",
    stock: "Post inventory movement",
    mapping: "Verify supplier mapping",
    amend: "Amend RFQ",
    details: "Record details",
  };
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titles[k]}
      >
        <div className="modal-header">
          <h2>{titles[k]}</h2>
          <button
            className="secondary small"
            onClick={close}
            disabled={busy}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {k === "details" ? (
          <div className="modal-content">
            <h3 style={{ marginTop: 20 }}>{t.reference}</h3>
            <p className="muted">{t.justification ?? t.title}</p>
            <Pill value={t.status} />
            <Table
              headers={["Product", "Quantity", "Specification"]}
              rows={(t.lines ?? []).map((l: Row) => [
                names.get(l.productId),
                Number(l.quantity),
                l.specifications ?? "—",
              ])}
            />
          </div>
        ) : (
          <form onSubmit={submit}>
            {["requisition", "vendorInvite", "stock"].includes(k) &&
              field("entityId", "Legal entity", "text", option(data.entities))}
            {k === "requisition" && (
              <>
                <div className="form-grid">
                  {field(
                    "departmentId",
                    "Department / cost center",
                    "text",
                    option(
                      data.departments.filter(
                        (x: Row) => x.entityId === form.entityId,
                      ),
                    ),
                  )}
                  {field(
                    "warehouseId",
                    "Delivery warehouse",
                    "text",
                    option(
                      data.warehouses.filter(
                        (x: Row) => x.entityId === form.entityId,
                      ),
                    ),
                  )}
                  {field("budgetId", "Budget", "text", [
                    { value: "", label: "No budget" },
                    ...option(
                      data.budgets.filter(
                        (x: Row) => x.entityId === form.entityId,
                      ),
                    ),
                  ])}
                  {field("requiredAt", "Required by", "datetime-local")}
                </div>
                {field("justification", "Business justification", "textarea")}
              </>
            )}
            {k === "revise" && (
              <>
                <div className="banner" style={{ marginTop: 15 }}>
                  This change resets the request to draft. Submit again for
                  approval.
                </div>
                {field("justification", "Business justification", "textarea")}
              </>
            )}
            {["requisition", "revise"].includes(k) && (
              <>
                <h3 style={{ marginTop: 20 }}>Requested items</h3>
                {lines.map((l, i) => (
                  <div className="line-editor" key={i}>
                    {field(
                      "productId",
                      "Product or service",
                      "text",
                      option(data.products),
                      i,
                    )}
                    <div className="form-grid">
                      {field(
                        "quantity",
                        "Quantity in base units",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "estimatedUnitPrice",
                        "Estimated net price / base unit",
                        "number",
                        undefined,
                        i,
                      )}
                    </div>
                    {field(
                      "specifications",
                      "Specifications",
                      "text",
                      undefined,
                      i,
                    )}
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() =>
                          setLines(lines.filter((_, j) => j !== i))
                        }
                      >
                        Remove line
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary small"
                  onClick={() =>
                    setLines([
                      ...lines,
                      {
                        productId: data.products[0]?.id,
                        quantity: "1",
                        estimatedUnitPrice: "0",
                        specifications: "",
                      },
                    ])
                  }
                >
                  + Add line
                </button>
              </>
            )}
            {k === "rfq" && (
              <>
                {field("title", "RFQ title")}
                {field(
                  "deadline",
                  "Submission deadline (your local timezone)",
                  "datetime-local",
                )}
                {field("sealed", "Sealed bidding", "checkbox")}
              </>
            )}
            {k === "rfqInvite" && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  Select approved vendors serving{" "}
                  {data.entities.find((e: Row) => e.id === t.entityId)?.country}
                  . Invitations enter the durable delivery queue.
                </p>
                {data.vendors
                  .filter(
                    (r: Row) =>
                      r.status === "APPROVED" &&
                      r.countries.includes(
                        data.entities.find((e: Row) => e.id === t.entityId)
                          ?.country,
                      ),
                  )
                  .map((r: Row) => (
                    <label key={r.id}>
                      <input
                        style={{ width: "auto", marginRight: 10 }}
                        type="checkbox"
                        checked={vendorIds.includes(r.id)}
                        onChange={(e) =>
                          setVendorIds(
                            e.target.checked
                              ? [...vendorIds, r.id]
                              : vendorIds.filter((id) => id !== r.id),
                          )
                        }
                      />
                      {r.name}
                    </label>
                  ))}
              </>
            )}
            {k === "approval" && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  Decision for {t.targetType} · version {t.targetVersion}
                </p>
                {field("decision", "Decision", "text", [
                  { value: "APPROVED", label: "Approve" },
                  { value: "REJECTED", label: "Reject" },
                  ...(t.targetType === "REQUISITION"
                    ? [{ value: "RETURNED", label: "Request changes" }]
                    : []),
                ])}
                {field("reason", "Decision reason", "textarea")}
              </>
            )}
            {k === "amend" && (
              <>
                {field("deadline", "New deadline", "datetime-local")}
                {field("terms", "Commercial terms", "textarea")}
                {field("reason", "Reason for amendment", "textarea")}
              </>
            )}
            {k === "quote" && (
              <>
                {!isVendor &&
                  field(
                    "vendorId",
                    "Invited supplier",
                    "text",
                    option(
                      data.vendors.filter((v: Row) =>
                        t.vendors.some((x: Row) => x.vendorId === v.id),
                      ),
                    ),
                  )}
                <div className="form-grid">
                  {field("currency", "ISO currency code")}
                  {field("leadDays", "Lead time (days)", "number")}
                  {field(
                    "freight",
                    "Freight — enter explicit zero if none",
                    "number",
                  )}
                  {field(
                    "otherCharges",
                    "Other charges — explicit zero if none",
                    "number",
                  )}
                  {field("validUntil", "Offer valid until", "datetime-local")}
                  {field("paymentTerms", "Payment terms")}
                  {!isVendor &&
                    field("fxRate", "FX to entity currency", "number")}
                  {!isVendor && field("fxSource", "Exchange rate source")}
                  {!isVendor &&
                    field("fxAt", "Exchange rate timestamp", "datetime-local")}
                </div>
                {isVendor && (
                  <p className="muted tiny">
                    Portal offers use the buying entity’s currency. Request
                    buyer assistance for a foreign-currency offer.
                  </p>
                )}
                {!isVendor &&
                  field("source", "Original offer source", "text", [
                    { value: "EMAIL", label: "Email" },
                    { value: "MANUAL", label: "Other external source" },
                  ])}
                {lines.map((l, i) => (
                  <div className="line-editor" key={i}>
                    <strong>{names.get(l.productId)}</strong>
                    <div className="form-grid">
                      {field(
                        "offeredQuantity",
                        "Offered number of packs",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "packFactor",
                        "Base units per pack",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "unitPrice",
                        "Price per pack",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "discountPercent",
                        "Discount %",
                        "number",
                        undefined,
                        i,
                      )}
                      {field("taxPercent", "Tax %", "number", undefined, i)}
                      {field("moq", "Minimum packs", "number", undefined, i)}
                    </div>
                    {field(
                      "compliant",
                      "Technically compliant",
                      "checkbox",
                      undefined,
                      i,
                    )}
                    {!isVendor &&
                      field(
                        "taxRecoverable",
                        "Tax recoverable (verified entity policy)",
                        "checkbox",
                        undefined,
                        i,
                      )}
                    <label>
                      Technical deviation
                      <input
                        value={l.deviation}
                        onChange={(e) =>
                          lineSet(i, "deviation", e.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
              </>
            )}
            {k === "award" && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  Allocate every requested base unit. Add another allocation to
                  split a line between suppliers. Full freight applies per
                  selected supplier.
                </p>
                {lines.map((l, i) => {
                  const choices = t.offers.flatMap((q: Row) =>
                    q.lines
                      .filter((x: Row) => x.rfqLineId === l.rfqLineId)
                      .map((x: Row) => ({
                        value: x.quoteLineId,
                        label:
                          q.vendor +
                          " · " +
                          amount(x.baseUnitPrice, q.currency) +
                          " / base unit",
                      })),
                  );
                  return (
                    <div className="line-editor" key={i}>
                      <strong>{names.get(l.productId)}</strong>
                      {field(
                        "quoteLineId",
                        "Supplier quotation line",
                        "text",
                        choices,
                        i,
                      )}
                      {field(
                        "quantity",
                        "Allocated base units",
                        "number",
                        undefined,
                        i,
                      )}
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() =>
                            setLines([...lines, { ...l, quantity: "1" }])
                          }
                        >
                          + Split allocation
                        </button>
                        {lines.length > t.rfq.lines.length && (
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() =>
                              setLines(lines.filter((_, j) => j !== i))
                            }
                          >
                            Remove allocation
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {field("reason", "Selection reason and tradeoffs", "textarea")}
              </>
            )}
            {k === "receipt" && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  Enter quantities in base units. Accepted goods become
                  available; rejected goods enter quarantine.
                </p>
                {lines.map((l, i) => (
                  <div className="line-editor" key={i}>
                    <strong>{names.get(l.productId)}</strong>
                    <div className="form-grid">
                      {field(
                        "accepted",
                        "Accepted units",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "rejected",
                        "Rejected units",
                        "number",
                        undefined,
                        i,
                      )}
                    </div>
                    {field("reason", "Inspection result", "text", undefined, i)}
                  </div>
                ))}
              </>
            )}
            {k === "invoice" && (
              <>
                <div className="form-grid">
                  {field("number", "Supplier invoice number")}
                  {field("dueAt", "Payment due", "datetime-local")}
                  {field("freight", "Invoice freight", "number")}
                  {field("otherCharges", "Invoice other charges", "number")}
                </div>
                {lines.map((l, i) => (
                  <div className="line-editor" key={i}>
                    <strong>{names.get(l.productId)}</strong>
                    <div className="form-grid">
                      {field(
                        "quantity",
                        "Invoice base quantity (0 to omit)",
                        "number",
                        undefined,
                        i,
                      )}
                      {field(
                        "unitPrice",
                        "Net price / base unit",
                        "number",
                        undefined,
                        i,
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {k === "payment" && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  Record only a payment that has been confirmed by your bank.
                  This does not initiate a transfer.
                </p>
                {field("amount", "Amount in invoice currency", "number")}
                {field("reference", "Unique bank transaction reference")}
                {field("paidAt", "Actual payment date", "datetime-local")}
              </>
            )}
            {k === "vendor" && (
              <>
                {field("name", "Legal company name")}
                {field("email", "Primary contact email", "email")}
                <div className="form-grid">
                  {field("countries", "Country codes (comma separated)")}
                  {field("currencies", "Currency codes (comma separated)")}
                  {field("categories", "Categories (comma separated)")}
                  {field("deliveryAreas", "Delivery areas (comma separated)")}
                </div>
                <label>
                  Tax identifier
                  <input
                    value={form.taxId}
                    onChange={(e) => set("taxId", e.target.value)}
                  />
                </label>
              </>
            )}
            {k === "qualify" && (
              <>
                {field("status", "Qualification status", "text", [
                  { value: "APPROVED", label: "Approve" },
                  { value: "SUSPENDED", label: "Suspend" },
                  { value: "BLOCKED", label: "Block" },
                ])}
                {field(
                  "reason",
                  "Verification or restriction reason",
                  "textarea",
                )}
              </>
            )}
            {k === "stock" && (
              <>
                {field(
                  "warehouseId",
                  "Warehouse",
                  "text",
                  option(
                    data.warehouses.filter(
                      (x: Row) => x.entityId === form.entityId,
                    ),
                  ),
                )}
                {field("productId", "Product", "text", option(data.products))}
                {field("type", "Movement", "text", [
                  { value: "ISSUE", label: "Issue available stock" },
                  { value: "RESERVE", label: "Reserve stock" },
                  { value: "RELEASE", label: "Release reservation" },
                  {
                    value: "QUARANTINE_RETURN",
                    label: "Return quarantined goods",
                  },
                  {
                    value: "ADJUSTMENT",
                    label: "Positive adjustment (administrator only)",
                  },
                ])}
                {field("quantity", "Base unit quantity", "number")}
                {field("reason", "Movement justification", "textarea")}
              </>
            )}
            {k === "mapping" && (
              <>
                {field("vendorId", "Supplier", "text", option(data.vendors))}
                {field("productId", "Product", "text", option(data.products))}
                {field("vendorSku", "Supplier SKU")}
                <div className="form-grid">
                  {field("unit", "Purchase unit")}
                  {field(
                    "packFactor",
                    "Base units per purchase unit",
                    "number",
                  )}
                  {field("price", "Price per purchase unit", "number")}
                  {field("currency", "Currency")}
                  {field("moq", "Minimum purchase units", "number")}
                  {field("leadDays", "Lead days", "number")}
                  {field("country", "Country code")}
                </div>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : ["receipt", "invoice", "payment"].includes(k)
                    ? "Post & validate"
                    : "Save & continue"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
