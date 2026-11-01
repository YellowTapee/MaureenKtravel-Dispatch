"use client";
import { useState } from "react";
type Row = { id: string; kind: string; name: string; [key: string]: any };
const cash = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    (v || 0) / 100,
  );
const specs: Record<string, string[]> = {
  inquiries: [
    "name",
    "email",
    "phone",
    "destination",
    "start",
    "end",
    "budget",
    "travelers",
    "source",
    "status",
    "notes",
  ],
  documents: [
    "name",
    "category",
    "status",
    "expires",
    "url",
    "visibility",
    "notes",
  ],
  schedules: ["name", "amount", "due", "status", "notes"],
  changes: [
    "name",
    "type",
    "status",
    "supplierPenalty",
    "clientRefund",
    "commissionLoss",
    "notes",
  ],
  expenses: ["name", "amount", "date", "supplier", "notes"],
  suppliers: [
    "name",
    "email",
    "phone",
    "portal",
    "commissionRules",
    "responseTime",
    "rating",
    "notes",
  ],
  travelers: [
    "name",
    "email",
    "phone",
    "passportExpiry",
    "visaExpiry",
    "preferences",
    "emergencyContact",
    "notes",
  ],
  communications: ["name", "type", "status", "date", "notes"],
};
const labels: Record<string, string> = {
  passportExpiry: "Passport expiry",
  visaExpiry: "Visa expiry",
  supplierPenalty: "Supplier penalty (CAD)",
  clientRefund: "Client refund (CAD)",
  commissionLoss: "Commission loss (CAD)",
  commissionRules: "Commission rules",
  responseTime: "Response time",
  emergencyContact: "Emergency contact",
  amount: "Amount (CAD)",
  budget: "Budget (CAD)",
  url: "Document link",
  visibility: "Visibility",
};
const amounts = [
  "amount",
  "budget",
  "supplierPenalty",
  "clientRefund",
  "commissionLoss",
];
const states: Record<string, string[]> = {
  inquiries: [
    "New inquiry",
    "Researching",
    "Quote sent",
    "Waiting for client",
    "Accepted",
    "Booked",
    "Lost",
  ],
  documents: ["Missing", "Received", "Expired", "Sent"],
  schedules: ["Pending", "Paid", "Cancelled"],
  changes: ["Requested", "In progress", "Completed", "Cancelled"],
  communications: ["Draft", "Sent", "Reply received"],
};
export default function Operations({
  data,
  trip = "",
  reload,
}: {
  data: Row[];
  trip?: string;
  reload: () => Promise<void>;
}) {
  const [section, setSection] = useState(trip ? "overview" : "inquiries"),
    [edit, setEdit] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [template, setTemplate] = useState("Quote"),
    [text, setText] = useState("");
  const current = data.find((r) => r.id === trip),
    today = new Date().toLocaleDateString("en-CA");
  const rows = (kind: string) =>
    data.filter((r) => r.kind === kind && (!trip || r.trip === trip));
  async function write(r: any) {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r),
    });
    const j = (await res.json()) as any;
    if (!res.ok) throw Error(j.error || "Save failed");
  }
  async function save(e: any) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = { ...edit };
      for (const k of amounts)
        if (r[k] !== undefined) r[k] = Math.round(Number(r[k]) * 100);
      await write(r);
      setEdit(null);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function open(kind: string, r?: Row) {
    setError("");
    setEdit(
      r
        ? {
            ...r,
            ...Object.fromEntries(
              amounts
                .filter((k) => r[k] !== undefined)
                .map((k) => [k, r[k] / 100]),
            ),
          }
        : {
            kind,
            name: "",
            trip,
            status: states[kind]?.[0] || "Active",
            visibility: "Internal",
          },
    );
  }
  async function convert(r: Row) {
    setBusy(true);
    try {
      const res = await fetch("/api/convert-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      if (!res.ok) throw Error("Conversion failed");
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const bookings = rows("bookings").filter((r) => r.status !== "Cancelled"),
    sale = bookings.reduce((s, r) => s + (r.sale || 0), 0),
    paid = rows("payments").reduce(
      (s, r) =>
        s +
        (r.type === "Client payment"
          ? r.amount
          : r.type === "Client refund"
            ? -r.amount
            : 0),
      0,
    );
  const missing = [
    ...(!current?.client ? ["Client not linked"] : []),
    ...(!current?.start ? ["Departure date missing"] : []),
    ...(!bookings.length ? ["No bookings"] : []),
    ...bookings.flatMap((b) => [
      ...(!b.reference ? [b.name + ": confirmation missing"] : []),
      ...(!b.start ? [b.name + ": dates missing"] : []),
      ...(b.sale < b.cost ? [b.name + ": negative margin"] : []),
    ]),
    ...rows("documents")
      .filter(
        (d) =>
          d.status === "Missing" ||
          d.status === "Expired" ||
          (d.expires && d.expires < today),
      )
      .map((d) => d.name + ": document needed"),
    ...(sale > paid ? ["Outstanding client balance " + cash(sale - paid)] : []),
    ...rows("tasks")
      .filter((t) => t.status !== "Done" && t.due && t.due < today)
      .map((t) => t.name + ": overdue"),
  ];
  const tabs = trip
    ? [
        "overview",
        "schedules",
        "documents",
        "travelers",
        "changes",
        "expenses",
        "communications",
        "templates",
        "packet",
        "history",
      ]
    : ["inquiries", "suppliers", "search", "agenda"];
  async function action(action: string, percent?: number) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/trip-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip, action, percent }),
      });
      const j = (await r.json()) as any;
      if (!r.ok) throw Error(j.error);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function draft() {
    const client = data.find((r) => r.id === current?.client);
    const body: Record<string, string> = {
      Quote: `Your quote for ${current?.destination || ""} is ready. Please review the options and let us know your preference.`,
      Payment: `Your outstanding balance is ${cash(sale - paid)}. Final payment is due ${current?.paymentDue || "[date]"}.`,
      Confirmation: `Your trip to ${current?.destination || ""} is confirmed for ${current?.start || "[date]"} to ${current?.end || "[date]"}.`,
      Documents:
        "Please send the outstanding documents listed below:\n" +
        rows("documents")
          .filter((d) => d.status === "Missing")
          .map((d) => d.name)
          .join("\n"),
      Departure: `Your trip begins ${current?.start || "[date]"}. Please review your itinerary and travel documents.`,
      Thanks: `Thank you for booking your trip to ${current?.destination || ""} with maureenKtravel. We would love your feedback.`,
    };
    setText(
      `Hi ${client?.name || "[client]"},\n\n${body[template]}\n\nMaureen K Travel`,
    );
  }
  return (
    <section className="panel operations">
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={section === t ? "selected" : ""}
            onClick={() => {
              setSection(t);
              setSearch("");
            }}
          >
            {({schedules:'Payments due',travelers:'Travellers',communications:'Messages',templates:'Message templates',packet:'Client itinerary',history:'Activity',inquiries:'New requests',agenda:'Coming up'} as Record<string,string>)[t]||t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {section === "overview" ? (
        <>
          <h2>{missing.length ? `${missing.length} things still needed` : 'Trip checks complete'}</h2>
          <div className="actions">
            <button disabled={busy} onClick={() => action("reminders")}>
              Create dated reminders & document checklist
            </button>
            <button disabled={busy} onClick={() => action("duplicate")}>
              Duplicate trip
            </button>
          </div>
          {missing.length ? (
            missing.map((m, i) => <p key={i}>{m}</p>)
          ) : (
            <p>All recorded checks passed.</p>
          )}
          <p>
            Readiness uses recorded information; document rules must be checked
            separately.
          </p>
          <h2>Timeline</h2>
          {[
            ...rows("bookings").map((r) => ({ ...r, when: r.start })),
            ...rows("tasks").map((r) => ({ ...r, when: r.due })),
            ...rows("schedules").map((r) => ({ ...r, when: r.due })),
          ]
            .sort((a, b) => (a.when || "9999").localeCompare(b.when || "9999"))
            .map((r: any) => (
              <p key={r.id}>
                {r.when || "Date pending"} · {r.name} · {r.status}
              </p>
            ))}
        </>
      ) : section === "templates" ? (
        <>
          <div className="actions">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {[
                "Quote",
                "Payment",
                "Confirmation",
                "Documents",
                "Departure",
                "Thanks",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button onClick={draft}>Fill from trip</button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                setError("Select the message and copy it manually.");
              }
            }}
          >
            Copy message
          </button>
          <button
            disabled={!text || busy}
            onClick={() =>
              open("communications", {
                id: undefined,
                kind: "communications",
                name: template + " message",
                notes: text,
                trip,
                status: "Draft",
                date: today,
              } as any)
            }
          >
            Save draft
          </button>
        </>
      ) : section === "packet" ? (
        <div className="travelpacket">
          <h2>{current?.name}</h2>
          <p>
            {current?.destination} · {current?.start} — {current?.end}
          </p>
          {bookings.map((b) => (
            <div className="timeline" key={b.id}>
              <span>{b.start}</span>
              <div>
                <h3>{b.name}</h3>
                <p>
                  {b.supplier} · {b.reference}
                </p>
                <p>{b.clientNotes}</p>
              </div>
            </div>
          ))}
          <p>
            Client total {cash(sale)} · Paid {cash(paid)} · Balance{" "}
            {cash(sale - paid)}
          </p>
          <h3>Travel documents</h3>
          {rows("documents")
            .filter((d) => d.visibility === "Client")
            .map((d) => (
              <p key={d.id}>
                {d.name}{" "}
                {d.url && /^https:\/\//.test(d.url) && (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </p>
            ))}
          <button onClick={() => window.print()}>Print / save PDF</button>
        </div>
      ) : section === "agenda" ? (
        <>
          <h2>Upcoming and overdue</h2>
          <label>
            Show
            <select
              value={search || "14"}
              onChange={(e) => setSearch(e.target.value)}
            >
              {["7", "14", "30", "365"].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          {data
            .filter(
              (r) =>
                ["tasks", "schedules", "documents", "quotes", "trips"].includes(
                  r.kind,
                ) &&
                ![
                  "Done",
                  "Paid",
                  "Cancelled",
                  "Completed",
                  "Accepted",
                ].includes(r.status),
            )
            .map((r) => ({ ...r, deadline: r.due || r.expires || r.start }))
            .filter(
              (r) =>
                r.deadline &&
                r.deadline <=
                  new Date(
                    Date.now() + Number(search || 14) * 86400000,
                  ).toLocaleDateString("en-CA"),
            )
            .sort((a, b) => a.deadline.localeCompare(b.deadline))
            .map((r: any) => (
              <p key={r.id} className={r.deadline < today ? "danger" : ""}>
                {r.deadline} · {r.kind} · {r.name} ·{" "}
                {data.find((t) => t.id === r.trip)?.name}
              </p>
            ))}
        </>
      ) : section === "history" ? (
        <>
          {rows("audit").map((r) => (
            <details key={r.id}>
              <summary>
                {r.date} · {r.name}
              </summary>
              {r.before && <p>Previous: {JSON.stringify(r.before)}</p>}
              {r.after && <p>Saved: {JSON.stringify(r.after)}</p>}
            </details>
          ))}
        </>
      ) : section === "search" ? (
        <>
          <input
            placeholder="Search all records…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search &&
            data
              .filter(
                (r) =>
                  r.kind !== "audit" &&
                  JSON.stringify(r)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((r) => (
                <p key={r.id}>
                  {r.kind} · {r.name} ·{" "}
                  {r.reference || r.destination || r.status}
                </p>
              ))}
        </>
      ) : (
        <>
          <div className="sectionhead">
            <h2>{section[0].toUpperCase() + section.slice(1)}</h2>
            <button onClick={() => open(section)}>+ Add</button>
          </div>
          {section === "schedules" && (
            <div className="actions">
              <button disabled={busy} onClick={() => action("schedule", 25)}>
                Create 25% deposit schedule
              </button>
              <button disabled={busy} onClick={() => action("schedule", 50)}>
                Create 50% deposit schedule
              </button>
              <p>
                Creates deposit and balance once. Edit dates and amounts below;
                record actual receipts in Payments.
              </p>
            </div>
          )}
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {rows(section)
            .filter((r) =>
              JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
            )
            .map((r) => (
              <div className="connection" key={r.id}>
                <div>
                  <button className="link" onClick={() => open(section, r)}>
                    {r.name}
                  </button>
                  <p>
                    {r.status} {r.due || r.expires || r.date}{" "}
                    {r.amount !== undefined && cash(r.amount)}
                  </p>
                  {section === "changes" && (
                    <p>
                      Refund {cash(r.clientRefund)} · Penalty{" "}
                      {cash(r.supplierPenalty)} · Commission loss{" "}
                      {cash(r.commissionLoss)}
                    </p>
                  )}
                </div>
                {section === "inquiries" && (
                  <button
                    disabled={busy || Boolean(r.convertedTrip)}
                    onClick={() => convert(r)}
                  >
                    Start trip
                  </button>
                )}
              </div>
            ))}
          {!rows(section).length && <p>No records yet.</p>}
        </>
      )}
      {edit && (
        <div className="overlay">
          <form className="modal" onSubmit={save}>
            <div className="sectionhead">
              <h2>
                {edit.id ? "Edit" : "Add"} {edit.kind}
              </h2>
              <button type="button" onClick={() => setEdit(null)}>
                Close
              </button>
            </div>
            {specs[edit.kind]?.map((k) => (
              <label key={k}>
                {labels[k] || k[0].toUpperCase() + k.slice(1)}
                {k === "status" && states[edit.kind] ? (
                  <select
                    value={edit[k] || states[edit.kind][0]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  >
                    {states[edit.kind].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                ) : k === "visibility" ? (
                  <select
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  >
                    <option>Internal</option>
                    <option>Client</option>
                  </select>
                ) : (
                  <input
                    required={k === "name"}
                    type={
                      amounts.includes(k) || k === "travelers"
                        ? "number"
                        : [
                              "due",
                              "expires",
                              "start",
                              "end",
                              "date",
                              "passportExpiry",
                              "visaExpiry",
                            ].includes(k)
                          ? "date"
                          : k === "email"
                            ? "email"
                            : ["url", "portal"].includes(k)
                              ? "url"
                              : "text"
                    }
                    min={amounts.includes(k) ? 0 : undefined}
                    step={amounts.includes(k) ? ".01" : undefined}
                    value={edit[k] ?? ""}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                )}
              </label>
            ))}
            {error && <p className="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
