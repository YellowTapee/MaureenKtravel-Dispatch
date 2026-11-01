"use client";
import { useState } from "react";
const money = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    (v || 0) / 100,
  );
export default function Tools({
  data,
  trip,
  reload,
}: {
  data: any[];
  trip?: string;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [currency, setCurrency] = useState("USD"),
    [foreign, setForeign] = useState(""),
    [rate, setRate] = useState("");
  async function upload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("trip", trip || "");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const j = (await res.json()) as any;
      if (!res.ok) throw Error(j.error);
      setMessage("Uploaded");
      await reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  function parse() {
    const get = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() || "";
    setDraft({
      kind: "bookings",
      trip,
      name: get(/(?:hotel|property|booking name)\s*[:#]\s*(.+)/i),
      reference: get(
        /(?:confirmation|reference|booking (?:id|number))\s*[:#]\s*([^\n]+)/i,
      ),
      start: get(/(?:check.?in|arrival|start)\s*:\s*(\d{4}-\d{2}-\d{2})/i),
      end: get(/(?:check.?out|departure|end)\s*:\s*(\d{4}-\d{2}-\d{2})/i),
      supplier: get(/supplier\s*:\s*(.+)/i),
      sale: "",
      cost: "",
      status: "Draft",
    });
  }
  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          sale: Math.round(Number(draft.sale) * 100),
          cost: Math.round(Number(draft.cost) * 100),
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw Error(j.error);
      setDraft(null);
      setText("");
      setMessage("Booking saved");
      await reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const payments = data.filter(
    (r) =>
      r.kind === "payments" &&
      (!trip || r.trip === trip) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to),
  );
  const trips = data.filter(
    (r) => r.kind === "trips" && (!trip || r.id === trip),
  );
  const reports = trips.map((t) => {
    const b = data.filter(
        (r) =>
          r.kind === "bookings" && r.trip === t.id && r.status !== "Cancelled",
      ),
      sum = (key: string) => b.reduce((s, r) => s + (r[key] || 0), 0),
      p = payments.filter((r) => r.trip === t.id),
      received = p
        .filter((r) => r.type === "Commission received")
        .reduce((s, r) => s + r.amount, 0),
      expected = b.reduce((s, r) => s + (r.expectedCommission || 0), 0),
      expenses = data
        .filter((r) => r.kind === "expenses" && r.trip === t.id)
        .reduce((s, r) => s + (r.amount || 0), 0);
    return [
      t.name,
      sum("sale") / 100,
      sum("cost") / 100,
      expenses / 100,
      (sum("sale") - sum("cost") - expenses) / 100,
      expected / 100,
      received / 100,
      (expected - received) / 100,
    ];
  });
  function csv() {
    const rows = [
      [
        "Trip",
        "Sale CAD",
        "Cost CAD",
        "Expenses CAD",
        "Margin after expenses CAD",
        "Expected commission CAD",
        "Received commission CAD",
        "Commission remaining CAD",
      ],
      ...reports,
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            rows
              .map((r) =>
                r
                  .map(
                    (v) =>
                      '"' +
                      String(v)
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
    const a = document.createElement("a");
    a.href = url;
    a.download = "agency-report.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel">
      <h2>{trip ? "Import & documents" : "Finance tools"}</h2>
      {message && <p role="status">{message}</p>}
      {trip && (
        <>
          <label>
            Upload document · max 10 MB
            <input disabled={busy} type="file" onChange={upload} />
          </label>
          {data
            .filter((r) => r.kind === "documents" && r.trip === trip && r.key)
            .map((d) => (
              <p key={d.id}>
                <a href={d.url}>{d.name}</a>
              </p>
            ))}
          <details>
            <summary>Import confirmation text</summary>
            <p>
              Paste text, extract labeled fields, then review. Dates use
              YYYY-MM-DD. Prices must be confirmed manually.
            </p>
            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button onClick={parse} disabled={!text}>
              Extract for review
            </button>
            {draft && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                {[
                  "name",
                  "reference",
                  "supplier",
                  "start",
                  "end",
                  "sale",
                  "cost",
                ].map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      required={["name", "sale", "cost"].includes(k)}
                      min={["sale", "cost"].includes(k) ? 0 : undefined}
                      step=".01"
                      type={
                        ["start", "end"].includes(k)
                          ? "date"
                          : ["sale", "cost"].includes(k)
                            ? "number"
                            : "text"
                      }
                      value={draft[k]}
                      onChange={(e) =>
                        setDraft({ ...draft, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <button disabled={busy}>Save reviewed booking</button>
              </form>
            )}
          </details>
        </>
      )}
      <details>
        <summary>Currency conversion</summary>
        <div className="formgrid">
          <label>
            Supplier currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label>
            Foreign amount
            <input
              type="number"
              min="0"
              value={foreign}
              onChange={(e) => setForeign(e.target.value)}
            />
          </label>
          <label>
            CAD per 1 {currency}
            <input
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        </div>
        <p>
          {money(Math.round(Number(foreign) * Number(rate) * 100))} · using your
          entered rate
        </p>
      </details>
      <details>
        <summary>Commission reconciliation & export</summary>
        <div className="formgrid">
          <label>
            Receipts from
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Receipts to
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p>
          Receipt dates filter commission received. Sales, costs, and expenses
          show trip totals.
        </p>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Margin after expenses</th>
                <th>Expected commission</th>
                <th>Received</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i}>
                  <td>{r[0]}</td>
                  {r.slice(4).map((v, j) => (
                    <td key={j}>{money(Number(v) * 100)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={csv}>Export report CSV</button>
      </details>
    </section>
  );
}
