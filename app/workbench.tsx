"use client";
import { useState } from "react";
export default function Workbench({
  data,
  trip,
  reload,
}: {
  data: any[];
  trip?: string;
  reload: () => Promise<void>;
}) {
  const [view, setView] = useState("Active trips"),
    [message, setMessage] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [source, setSource] = useState(""),
    [backup, setBackup] = useState<any[] | null>(null),
    [busy, setBusy] = useState(false);
  async function run(body: any) {
    setBusy(true);
    try {
      const r = await fetch("/api/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as any;
      if (!r.ok) throw Error(j.error);
      setMessage(
        j.added !== undefined ? `Restored ${j.added} missing records` : "Saved",
      );
      setChosen([]);
      setBackup(null);
      await reload();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const today = new Date().toLocaleDateString("en-CA"),
    clients = data.filter((r) => r.kind === "clients" && !r.archived);
  const duplicates = clients.filter((r, i) =>
    clients.some(
      (o, j) =>
        i !== j &&
        ((r.email &&
          o.email &&
          r.email.toLowerCase() === o.email.toLowerCase()) ||
          r.name.trim().toLowerCase() === o.name.trim().toLowerCase()),
    ),
  );
  const filtered = data
    .filter(
      (r) =>
        (!trip || r.trip === trip || r.id === trip) &&
        (view === "Active trips"
          ? r.kind === "trips" && !r.archived
          : view === "Archived"
            ? r.archived
            : view === "Pinned"
              ? r.pinned
              : view === "Open tasks"
                ? r.kind === "tasks" && r.status !== "Done"
                : view === "Missing documents"
                  ? r.kind === "documents" &&
                    (r.status === "Missing" || (r.expires && r.expires < today))
                  : view === "Waiting for client"
                    ? r.kind === "inquiries" &&
                      r.status === "Waiting for client"
                    : r.kind === "quotes" &&
                      r.status !== "Accepted" &&
                      r.expires &&
                      r.expires >= today),
    )
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "maureenktravel-records-v1",
              exported: new Date().toISOString(),
              records: data.filter((r) => r.kind !== "audit"),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "maureenktravel-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel">
      <h2>Quick work</h2>
      {message && <p role="status">{message}</p>}
      <label>
        Show
        <select
          value={view}
          onChange={(e) => {
            setView(e.target.value);
            setChosen([]);
          }}
        >
          {[
            "Active trips",
            "Archived",
            "Pinned",
            "Open tasks",
            "Missing documents",
            "Waiting for client",
            "Expiring quotes",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {filtered.map((r) => (
        <div className="connection" key={r.id}>
          <div>
            {["tasks", "documents"].includes(r.kind) && (
              <input
                style={{ width: 20 }}
                aria-label={"Select " + r.name}
                type="checkbox"
                checked={chosen.includes(r.id)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, r.id]
                      : chosen.filter((id) => id !== r.id),
                  )
                }
              />
            )}
            <strong>{r.name}</strong>
            <p>
              {r.kind} · {r.status}
            </p>
          </div>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => run({ action: "pin", id: r.id })}
            >
              {r.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              disabled={busy}
              onClick={() => run({ action: "archive", id: r.id })}
            >
              {r.archived ? "Restore" : "Archive"}
            </button>
            <button
              disabled={busy}
              onClick={() => run({ action: "undo", id: r.id })}
            >
              Undo last edit
            </button>
          </div>
        </div>
      ))}
      {chosen.length > 0 && (
        <button
          disabled={busy}
          onClick={() => run({ action: "bulk", ids: chosen })}
        >
          Mark selected tasks done / documents received
        </button>
      )}
      <details>
        <summary>
          Duplicate clients · {duplicates.length} possible matches
        </summary>
        <p>
          Choose the client to keep. Trips move to that client; the other
          profile is archived.
        </p>
        <label>
          Profile to merge
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Keep this profile
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose client</option>
            {clients
              .filter((c) => c.id !== source)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={busy || !source || !target}
          onClick={() => run({ action: "merge", id: source, target })}
        >
          Merge selected profiles
        </button>
      </details>
      <details>
        <summary>Backup & restore</summary>
        <p>
          Records export only. Downloaded documents must be kept separately.
          Restore adds missing records and preserves existing records.
        </p>
        <button onClick={download}>Download backup</button>
        <label>
          Choose backup
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (!f) return;
                const j = JSON.parse(await f.text());
                if (
                  j.format !== "maureenktravel-records-v1" ||
                  !Array.isArray(j.records)
                )
                  throw Error("Choose a maureenKtravel backup");
                setBackup(j.records);
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          />
        </label>
        {backup && (
          <>
            <p>
              {backup.length} records in file.{" "}
              {backup.filter((r) => !data.some((x) => x.id === r.id)).length}{" "}
              missing from workspace.
            </p>
            <button
              disabled={busy}
              onClick={() => run({ action: "restore", records: backup })}
            >
              Restore missing records
            </button>
          </>
        )}
      </details>
      <details>
        <summary>Reading size</summary>
        <button
          onClick={() =>
            document.documentElement.classList.toggle("large-text")
          }
        >
          Toggle larger text
        </button>
      </details>
    </section>
  );
}
