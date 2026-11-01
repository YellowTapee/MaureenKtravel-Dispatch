"use client";
import { useState, useEffect } from "react";
import Operations from "./operations";
import Tools from "./tools";
import Workbench from "./workbench";
type R = { id: string; kind: string; name: string; [key: string]: any };
const money = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    (n || 0) / 100,
  );
export default function App() {
  const [data, setData] = useState<R[]>([]),
    [page, setPage] = useState("Home"),
    [trip, setTrip] = useState(""),
    [tab, setTab] = useState("bookings"),
    [form, setForm] = useState<any>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const list = (k: string) => data.filter((r) => r.kind === k);
  const current = data.find((r) => r.id === trip);
  const names: Record<string, string> = {
    Finance: "Money",
    Reports: "Reports",
    Operations: "Work",
    Connections: "Settings",
  };
  useEffect(() => {
    if (form)
      try {
        localStorage.setItem("mkt-form-draft", JSON.stringify(form));
      } catch {}
  }, [form]);
  function recover() {
    try {
      const draft = localStorage.getItem("mkt-form-draft");
      if (draft) setForm(JSON.parse(draft));
      else setError("No saved draft on this device.");
    } catch {
      setError("Could not recover this draft.");
    }
  }
  async function load() {
    try {
      const r = await fetch("/api/records");
      if (!r.ok) throw Error("Could not load records");
      setData(await r.json());
      setReady(true);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function totals(id = "") {
    const b = list("bookings").filter((r) => !id || r.trip === id),
      p = list("payments").filter((r) => !id || r.trip === id),
      sum = (a: R[], k: string) => a.reduce((s, x) => s + (x[k] || 0), 0);
    return {
      sale: sum(b, "sale"),
      cost: sum(b, "cost"),
      paid:
        sum(
          p.filter((r) => r.type === "Client payment"),
          "amount",
        ) -
        sum(
          p.filter((r) => r.type === "Client refund"),
          "amount",
        ),
      commission: sum(
        p.filter((r) => r.type === "Commission received"),
        "amount",
      ),
    };
  }
  function open(kind: string, r?: R) {
    setError("");
    setForm(
      r
        ? {
            ...r,
            ...Object.fromEntries(
              ["sale", "cost", "amount", "expectedCommission"]
                .filter((k) => r[k] !== undefined)
                .map((k) => [k, (r[k] / 100).toFixed(2)]),
            ),
          }
        : {
            kind,
            name: "",
            trip,
            status: kind === "tasks" ? "Open" : "Draft",
            type: kind === "payments" ? "Client payment" : "Hotel",
            supplier: "Manual",
          },
    );
  }
  function go(s: string) {
    setPage(s);
    setTrip("");
    setQuery("");
  }
  async function checklist() {
    setBusy(true);
    try {
      for (const name of [
        "Collect deposit",
        "Confirm traveler names",
        "Confirm supplier bookings",
        "Collect final payment",
        "Send travel documents",
        "Pre-departure follow-up",
      ]) {
        const id = `checklist-${trip}-${name.replaceAll(" ", "-")}`;
        if (data.some((r) => r.id === id)) continue;
        const res = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            kind: "tasks",
            name,
            trip,
            status: "Open",
          }),
        });
        if (!res.ok)
          throw Error(
            "Could not finish checklist. Retry to add remaining tasks.",
          );
      }
      await load();
      setTab("tasks");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function acceptQuote(q: R) {
    setBusy(true);
    try {
      const res = await fetch("/api/accept-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id }),
      });
      if (!res.ok) throw Error("Unable to accept quote");
      await load();
      setTab("bookings");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: any) {
    e.preventDefault();
    setBusy(true);
    const x = { ...form };
    for (const k of ["sale", "cost", "amount", "expectedCommission"])
      if (x[k] !== undefined) x[k] = Math.round(Number(x[k]) * 100);
    try {
      const r = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(x),
        }),
        j: any = await r.json();
      if (!r.ok) throw Error(j.error);
      setForm(null);
      localStorage.removeItem("mkt-form-draft");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportCSV() {
    const rows = [
      [
        "Trip",
        "Client sale CAD",
        "Supplier cost CAD",
        "Client paid net CAD",
        "Balance CAD",
        "Expected margin CAD",
        "Commission received CAD",
      ],
      ...list("trips").map((t) => {
        const s = totals(t.id);
        return [
          t.name,
          s.sale / 100,
          s.cost / 100,
          s.paid / 100,
          (s.sale - s.paid) / 100,
          (s.sale - s.cost) / 100,
          s.commission / 100,
        ];
      }),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            rows
              .map((r) =>
                r
                  .map(
                    (x) =>
                      '"' +
                      String(x)
                        .replace(/^[=+@-]/, "'")
                        .replaceAll('"', '""') +
                      '"',
                  )
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv" },
      ),
    );
    a.download = "maureenktravel-ledger.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  const field = (
    k: string,
    label: string,
    type = "text",
    options?: string[],
  ) => (
    <label key={k}>
      {label}
      {options ? (
        <select
          value={form[k] || options[0]}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          required={["name", "sale", "cost", "amount"].includes(k)}
          min={type === "number" ? 0 : undefined}
          step={type === "number" ? ".01" : undefined}
          type={type}
          value={form[k] ?? ""}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
      )}
    </label>
  );
  function table(rows: R[], kind: string) {
    const shown = rows.filter((r) =>
      (r.name + " " + (r.destination || "") + " " + (r.reference || ""))
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    return (
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>
                {kind === "clients"
                  ? "Client"
                  : kind === "trips"
                    ? "Trip"
                    : "Description"}
              </th>
              <th>Details</th>
              <th>
                {["bookings", "payments"].includes(kind)
                  ? "Amount (CAD)"
                  : "Status"}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <button
                    className="link"
                    onClick={() =>
                      kind === "trips"
                        ? (setTrip(r.id), setTab("bookings"))
                        : open(kind, r)
                    }
                  >
                    {r.name}
                  </button>
                  {r.start && (
                    <small>
                      {r.start} — {r.end}
                    </small>
                  )}
                </td>
                <td>
                  {r.email ||
                    r.destination ||
                    (kind === "payments"
                      ? r.type
                      : kind === "tasks"
                        ? r.due
                        : r.supplier) ||
                    "—"}
                  {r.reference && <small>{r.reference}</small>}
                </td>
                <td>
                  {kind === "bookings" ? (
                    money(r.sale)
                  ) : kind === "payments" ? (
                    money(r.amount)
                  ) : (
                    <span className="badge">{r.status || "Active"}</span>
                  )}
                </td>
                <td>
                  <button className="link" onClick={() => open(kind, r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <div className="empty">
            <strong>No {kind} yet</strong>
            <p>
              {rows.length
                ? "Try another search."
                : "Add your first record to get started."}
            </p>
          </div>
        )}
      </div>
    );
  }
  const s = totals(trip);
  const today = new Date().toLocaleDateString("en-CA");
  const openTasks = list("tasks").filter((t) => t.status !== "Done");
  const overdue = openTasks.filter((t) => t.due && t.due < today);
  const stats = (
    <div className="stats">
      {[
        ["Client total", money(s.sale)],
        ["Still owed", money(s.sale - s.paid)],
        ["Estimated profit", money(s.sale - s.cost)],
        ["Commission received", money(s.commission)],
      ].map(([l, v]) => (
        <div key={l}>
          <span>{l}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
  return (
    <div className="shell">
      <aside>
        <img src="/logo.png" alt="Maureen K Travel" />
        <small className="eyebrow">AGENCY WORKSPACE</small>
        <nav>
          {["Home", "Trips", "Clients", "Finance", "Reports", "Operations"].map(
            (p, i) => (
              <button
                className={page === p ? "active" : ""}
                key={p}
                onClick={() => go(p)}
              >
                <span>{["◈", "✈", "◉", "▤", "▥"][i]}</span>
                {names[p] || p}
              </button>
            ),
          )}
        </nav>
        <div className="bottom">
          <button onClick={() => go("Connections")}>⚙ Settings</button>
          <button onClick={recover}>Continue saved draft</button>
          <small>Private workspace</small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Workspace <b>/</b> {current?.name || page}
          </span>
          <button className="primary" onClick={() => open("trips")}>
            + New trip
          </button>
        </header>
        <article>
          <div className="title">
            <div>
              <h1>
                {current?.name ||
                  (page === "Home" ? "Today" : names[page] || page)}
              </h1>
              <p>
                {current
                  ? `${current.destination || ""} · ${current.start || "Dates pending"}`
                  : page === "Home"
                    ? new Date().toLocaleDateString("en-CA", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })
                    : ""}
              </p>
            </div>
            {trip ? (
              <button onClick={() => setTrip("")}>← All trips</button>
            ) : ["Clients", "Trips"].includes(page) ? (
              <button onClick={() => open(page.toLowerCase())}>
                + Add {page === "Trips" ? "trip" : "client"}
              </button>
            ) : null}
          </div>
          {error && !form && (
            <div role="alert" className="alert">
              {error} <button onClick={load}>Retry</button>
            </div>
          )}
          {!ready ? (
            <p>Loading…</p>
          ) : trip ? (
            <>
              {stats}
              <div className="tabs">
                {["quotes", "bookings", "payments", "tasks", "itinerary"].map(
                  (t) => (
                    <button
                      className={tab === t ? "selected" : ""}
                      key={t}
                      onClick={() => setTab(t)}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ),
                )}
              </div>
              {tab === "quotes" ? (
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Quote options · CAD</h2>
                    <button onClick={() => open("quotes")}>+ Add option</button>
                  </div>
                  <div className="quotegrid">
                    {list("quotes")
                      .filter((q) => q.trip === trip)
                      .map((q) => (
                        <div className="quoteoption" key={q.id}>
                          <div className="sectionhead">
                            <h3>{q.name}</h3>
                            <span className="badge">{q.status}</span>
                          </div>
                          <strong>{money(q.sale)}</strong>
                          <p>
                            {q.supplier} · {q.start || "Dates pending"}
                          </p>
                          <p>{q.inclusions || "Inclusions pending"}</p>
                          <p>Cancellation: {q.cancellation || "Not entered"}</p>
                          <p>Valid until: {q.expires || "Not entered"}</p>
                          <p className="internal">
                            Cost {money(q.cost)} · Margin{" "}
                            {money(q.sale - q.cost)}
                          </p>
                          <div className="actions">
                            <button onClick={() => open("quotes", q)}>
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                open("quotes", {
                                  ...q,
                                  id: undefined,
                                  name: q.name + " copy",
                                  status: "Draft",
                                } as any)
                              }
                            >
                              Duplicate
                            </button>
                            <button
                              className="primary"
                              disabled={
                                busy ||
                                q.status === "Accepted" ||
                                Boolean(q.expires && q.expires < today)
                              }
                              onClick={() => acceptQuote(q)}
                            >
                              Accept & create booking
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {!list("quotes").some((q) => q.trip === trip) && (
                    <div className="empty">
                      Add options to compare prices, inclusions, and
                      cancellation terms.
                    </div>
                  )}
                </section>
              ) : tab === "itinerary" ? (
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Itinerary</h2>
                    <button onClick={() => window.print()}>Print / PDF</button>
                  </div>
                  {list("bookings")
                    .filter((r) => r.trip === trip)
                    .sort((a, b) =>
                      (a.start || "").localeCompare(b.start || ""),
                    )
                    .map((b) => (
                      <div className="timeline" key={b.id}>
                        <span>{b.start || "Date pending"}</span>
                        <div>
                          <h3>{b.name}</h3>
                          <p>
                            {b.supplier} ·{" "}
                            {b.reference || "Confirmation pending"}
                          </p>
                          <p>{b.notes}</p>
                        </div>
                      </div>
                    ))}
                </section>
              ) : (
                <>
                  <div className="sectionhead">
                    <h2>{tab[0].toUpperCase() + tab.slice(1)}</h2>
                    {tab === "tasks" && (
                      <button disabled={busy} onClick={checklist}>
                        Add standard checklist
                      </button>
                    )}
                    <button onClick={() => open(tab)}>
                      + Add {tab.slice(0, -1)}
                    </button>
                  </div>
                  {table(
                    list(tab).filter((r) => r.trip === trip),
                    tab,
                  )}
                </>
              )}
              <section className="panel">
                <h2>Trip notes</h2>
                <p>{current?.notes || "No notes"}</p>
                <button className="link" onClick={() => open("trips", current)}>
                  Edit trip
                </button>
              </section>
              <Operations key={trip} data={data} trip={trip} reload={load} />
              <Tools data={data} trip={trip} reload={load} />
              <Workbench data={data} trip={trip} reload={load} />
            </>
          ) : page === "Home" ? (
            <>
              <div className="stats">
                <div>
                  <span>Active trips</span>
                  <strong>
                    {
                      list("trips").filter(
                        (t) => !["Completed", "Cancelled"].includes(t.status),
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <span>Client balances</span>
                  <strong>{money(s.sale - s.paid)}</strong>
                </div>
                <div>
                  <span>Open tasks</span>
                  <strong>{openTasks.length}</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong className={overdue.length ? "danger" : ""}>
                    {overdue.length}
                  </strong>
                </div>
              </div>
              <div className="columns">
                <section>
                  <div className="sectionhead">
                    <h2>Upcoming trips</h2>
                    <button className="link" onClick={() => go("Trips")}>
                      View all →
                    </button>
                  </div>
                  {table(
                    list("trips")
                      .filter((t) => t.start && t.start >= today)
                      .sort((a, b) => a.start.localeCompare(b.start)),
                    "trips",
                  )}
                  <section className="panel">
                    <h2>Quick actions</h2>
                    <div className="actions">
                      {["clients", "bookings", "payments", "tasks"].map((k) => (
                        <button key={k} onClick={() => open(k)}>
                          + {k.slice(0, -1)}
                        </button>
                      ))}
                    </div>
                  </section>
                </section>
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Needs attention</h2>
                    {overdue.length > 0 && (
                      <span className="badge danger">
                        {overdue.length} overdue
                      </span>
                    )}
                  </div>
                  {list("trips")
                    .filter(
                      (t) =>
                        t.paymentDue &&
                        totals(t.id).sale > totals(t.id).paid &&
                        !["Cancelled", "Completed"].includes(t.status),
                    )
                    .sort((a, b) => a.paymentDue.localeCompare(b.paymentDue))
                    .map((t) => (
                      <div className="task" key={"balance-" + t.id}>
                        <button
                          className="link"
                          onClick={() => {
                            setTrip(t.id);
                            setTab("payments");
                          }}
                        >
                          {t.name} ·{" "}
                          {money(totals(t.id).sale - totals(t.id).paid)}
                        </button>
                        <small className={t.paymentDue < today ? "danger" : ""}>
                          Payment due {t.paymentDue}
                        </small>
                      </div>
                    ))}
                  {list("quotes")
                    .filter(
                      (q) =>
                        q.status !== "Accepted" &&
                        q.status !== "Cancelled" &&
                        q.expires &&
                        q.expires >= today,
                    )
                    .sort((a, b) => a.expires.localeCompare(b.expires))
                    .slice(0, 5)
                    .map((q) => (
                      <div className="task" key={q.id}>
                        <button
                          className="link"
                          onClick={() => {
                            setTrip(q.trip);
                            setTab("quotes");
                          }}
                        >
                          {q.name}
                        </button>
                        <small>Quote expires {q.expires}</small>
                      </div>
                    ))}
                  {openTasks
                    .sort((a, b) =>
                      (a.due || "9999").localeCompare(b.due || "9999"),
                    )
                    .map((t) => (
                      <div className="task" key={t.id}>
                        <button
                          className="link"
                          onClick={() => open("tasks", t)}
                        >
                          {t.name}
                        </button>
                        <small
                          className={t.due && t.due < today ? "danger" : ""}
                        >
                          {t.due || "No due date"} ·{" "}
                          {data.find((r) => r.id === t.trip)?.name ||
                            "Unassigned"}
                        </small>
                      </div>
                    ))}
                  {!openTasks.length &&
                    !list("trips").some(
                      (t) =>
                        t.paymentDue && totals(t.id).sale > totals(t.id).paid,
                    ) &&
                    !list("quotes").some(
                      (q) =>
                        q.expires &&
                        q.expires >= today &&
                        q.status !== "Accepted" &&
                        q.status !== "Cancelled",
                    ) && <div className="empty">You're all caught up.</div>}
                  <button onClick={() => open("tasks")}>+ Add task</button>
                </section>
              </div>
              <div className="notice">
                Supplier connections are not enabled.{" "}
                <button className="link" onClick={() => go("Connections")}>
                  View connections →
                </button>
              </div>
            </>
          ) : ["Trips", "Clients"].includes(page) ? (
            <>
              <input
                className="search"
                placeholder={`Search ${page.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {table(list(page.toLowerCase()), page.toLowerCase())}
            </>
          ) : page === "Operations" ? (
            <>
              <Operations data={data} reload={load} />
              <Workbench data={data} reload={load} />
            </>
          ) : ["Finance", "Reports"].includes(page) ? (
            <>
              <Tools data={data} reload={load} />
              {stats}
              <div className="sectionhead">
                <h2>Trip ledger · CAD</h2>
                <button onClick={exportCSV}>↓ Export Excel CSV</button>
              </div>
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Trip",
                        "Client total",
                        "Supplier cost",
                        "Net paid",
                        "Balance",
                        "Margin",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list("trips").map((t) => {
                      const x = totals(t.id);
                      return (
                        <tr key={t.id}>
                          <td>
                            <button
                              className="link"
                              onClick={() => setTrip(t.id)}
                            >
                              {t.name}
                            </button>
                          </td>
                          {[
                            x.sale,
                            x.cost,
                            x.paid,
                            x.sale - x.paid,
                            x.sale - x.cost,
                          ].map((n, i) => (
                            <td key={i}>{money(n)}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="notice">
                Expected margin = sale minus supplier cost. Commission receipts
                are separate, not added again. Operational ledger only; taxes
                and currency conversion are not automated.
              </p>
            </>
          ) : (
            <section className="panel">
              <h2>Connections</h2>
              {["RateHawk", "Expedia TAAP", "Amadeus", "QuickBooks"].map(
                (p) => (
                  <div className="connection" key={p}>
                    <div>
                      <h3>{p}</h3>
                      <p>Approved account / API access required</p>
                    </div>
                    <span className="badge">Not connected</span>
                  </div>
                ),
              )}
              <p>
                Manual entry is ready. Email/PDF imports, live sync, document
                storage, invoicing and client portals are not enabled yet.
              </p>
            </section>
          )}
        </article>
      </main>
      {form && (
        <div className="overlay">
          <form onSubmit={save} className="modal">
            <div className="sectionhead">
              <h2>
                {form.id ? "Edit" : "Add"} {form.kind.slice(0, -1)}
              </h2>
              <button
                type="button"
                onClick={() => setForm(null)}
                aria-label="Close form"
              >
                ✕
              </button>
            </div>
            {error && (
              <p role="alert" className="alert">
                {error}
              </p>
            )}
            {field("name", "Name")}
            {form.kind === "clients" ? (
              <>
                {field("email", "Email", "email")}
                {field("phone", "Phone")}
                {field("notes", "Preferences / notes")}
              </>
            ) : (
              <>
                {form.kind === "trips" ? (
                  <>
                    <label>
                      Client
                      <select
                        value={form.client || ""}
                        onChange={(e) =>
                          setForm({ ...form, client: e.target.value })
                        }
                      >
                        <option value="">Choose client</option>
                        {list("clients").map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {field("destination", "Destination")}
                    {field("travelers", "Number of travelers", "number")}
                    {field("paymentDue", "Final payment due", "date")}
                  </>
                ) : (
                  <label>
                    Trip
                    <select
                      required
                      value={form.trip || ""}
                      onChange={(e) =>
                        setForm({ ...form, trip: e.target.value })
                      }
                    >
                      <option value="">Choose trip</option>
                      {list("trips").map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {["bookings", "trips", "quotes"].includes(form.kind) && (
                  <div className="formgrid">
                    {field("start", "Start", "date")}
                    {field("end", "End", "date")}
                  </div>
                )}
                {["bookings", "quotes"].includes(form.kind) && (
                  <>
                    {field("supplier", "Supplier", "text", [
                      "Manual",
                      "RateHawk",
                      "Expedia TAAP",
                      "Amadeus",
                      "Other",
                    ])}
                    {field("reference", "Confirmation number")}
                    {field(
                      "expectedCommission",
                      "Expected commission (CAD)",
                      "number",
                    )}
                    {field("clientNotes", "Client itinerary notes")}
                    <div className="formgrid">
                      {field("sale", "Price for client (CAD)", "number")}
                      {field("cost", "Supplier cost (CAD)", "number")}
                    </div>
                  </>
                )}
                {form.kind === "quotes" && (
                  <>
                    {field("inclusions", "Included services")}
                    {field("cancellation", "Cancellation terms")}
                    {field("expires", "Quote valid until", "date")}
                    <p>
                      Expected margin:{" "}
                      {money(
                        Math.round(
                          ((Number(form.sale) || 0) -
                            (Number(form.cost) || 0)) *
                            100,
                        ),
                      )}
                    </p>
                  </>
                )}
                {form.kind === "payments" && (
                  <>
                    {field("type", "Type", "text", [
                      "Client payment",
                      "Client refund",
                      "Supplier payment",
                      "Supplier refund",
                      "Commission received",
                    ])}
                    {field("amount", "Amount (CAD)", "number")}
                    {field("date", "Date", "date")}
                  </>
                )}
                {form.kind === "tasks" ? (
                  <>
                    {field("due", "Due date", "date")}
                    {field("status", "Status", "text", ["Open", "Done"])}
                  </>
                ) : (
                  form.kind !== "payments" &&
                  field("status", "Status", "text", [
                    "Draft",
                    "Quoted",
                    "Confirmed",
                    "Travelling",
                    "Completed",
                    "Cancelled",
                  ])
                )}
                {field("notes", "Notes")}
              </>
            )}
            <div className="modalfooter">
              <button type="button" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
