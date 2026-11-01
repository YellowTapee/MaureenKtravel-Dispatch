import { env } from "cloudflare:workers";
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const x = (await req.json()) as any,
      now = new Date().toISOString();
    const all = await env.DB!.prepare("SELECT * FROM records").all();
    const records = all.results.map((r: any) => ({
      ...r,
      value: JSON.parse(r.data),
    }));
    const row = records.find((r) => r.id === x.id);
    const update = (id: string, value: any) =>
      env
        .DB!.prepare("UPDATE records SET data=?,updated=? WHERE id=?")
        .bind(JSON.stringify(value), now, id);
    const audit = (r: any) =>
      env
        .DB!.prepare(
          "INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          "audit",
          JSON.stringify({
            name: "Updated " + r.kind + ": " + r.value.name,
            record: r.id,
            trip: r.value.trip || (r.kind === "trips" ? r.id : ""),
            date: now,
            before: r.value,
          }),
          now,
        );
    if (x.action === "restore") {
      if (!Array.isArray(x.records) || x.records.length > 500)
        throw Error("Import at most 500 records at a time");
      const allowed = [
        "clients",
        "trips",
        "bookings",
        "quotes",
        "tasks",
        "payments",
        "documents",
        "schedules",
        "changes",
        "expenses",
        "suppliers",
        "travelers",
        "communications",
        "inquiries",
      ];
      const additions = x.records.filter(
        (r: any) =>
          allowed.includes(r.kind) &&
          typeof r.id === "string" &&
          typeof r.name === "string" &&
          !records.some((old) => old.id === r.id),
      );
      const inserts = additions.map(({ id, kind, ...data }: any) =>
        env
          .DB!.prepare(
            "INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(id, kind, JSON.stringify(data), now),
      );
      for (let i = 0; i < inserts.length; i += 50)
        await env.DB!.batch(inserts.slice(i, i + 50));
      return Response.json({ ok: true, added: additions.length });
    }
    if (x.action === "bulk") {
      const targets = records.filter(
        (r) =>
          Array.isArray(x.ids) &&
          x.ids.includes(r.id) &&
          ["tasks", "documents"].includes(r.kind),
      );
      await env.DB!.batch(
        targets.flatMap((r) => [
          audit(r),
          update(r.id, {
            ...r.value,
            status: r.kind === "tasks" ? "Done" : "Received",
          }),
        ]),
      );
      return Response.json({ ok: true });
    }
    if (!row) throw Error("Record not found");
    if (x.action === "merge") {
      const target = records.find(
        (r) => r.id === x.target && r.kind === "clients",
      );
      if (row.kind !== "clients" || !target || target.id === row.id)
        throw Error("Choose two different clients");
      await env.DB!.batch([
        audit(row),
        ...records
          .filter((r) => r.value.client === row.id)
          .map((r) => update(r.id, { ...r.value, client: target.id })),
        update(row.id, { ...row.value, archived: true, mergedInto: target.id }),
        update(target.id, {
          ...row.value,
          ...target.value,
          notes: [target.value.notes, row.value.notes]
            .filter(Boolean)
            .join("\n"),
        }),
      ]);
    } else if (x.action === "undo") {
      const change = records
        .filter(
          (r) =>
            r.kind === "audit" && r.value.record === row.id && r.value.before,
        )
        .sort((a, b) => b.updated.localeCompare(a.updated))[0];
      if (!change) throw Error("No earlier saved version");
      await env.DB!.batch([audit(row), update(row.id, change.value.before)]);
    } else if (["archive", "pin", "close"].includes(x.action)) {
      if (x.action === "close" && row.kind !== "trips")
        throw Error("Choose a trip");
      await env.DB!.batch([
        audit(row),
        update(row.id, {
          ...row.value,
          ...(x.action === "pin"
            ? { pinned: !row.value.pinned }
            : x.action === "close"
              ? { status: "Completed", archived: true }
              : { archived: !row.value.archived }),
        }),
      ]);
    } else throw Error("Unknown action");
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
