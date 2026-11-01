import { env } from "cloudflare:workers";
export async function GET() {
  try {
    const r = await env
      .DB!.prepare("SELECT * FROM records ORDER BY updated DESC")
      .all();
    return Response.json(
      r.results.map((x: any) => ({
        id: x.id,
        kind: x.kind,
        ...JSON.parse(x.data),
      })),
    );
  } catch {
    return Response.json({ error: "Records unavailable" }, { status: 503 });
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const x: any = await req.json();
    if (
      ![
        "clients",
        "trips",
        "bookings",
        "payments",
        "tasks",
        "quotes",
        "inquiries",
        "documents",
        "schedules",
        "changes",
        "expenses",
        "suppliers",
        "travelers",
        "communications",
      ].includes(x.kind) ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 200
    )
      throw Error("Name required");
    for (const k of [
      "sale",
      "cost",
      "amount",
      "budget",
      "supplierPenalty",
      "clientRefund",
      "commissionLoss",
      "expectedCommission",
    ])
      if (x[k] !== undefined && (!Number.isSafeInteger(x[k]) || x[k] < 0))
        throw Error("Invalid amount");
    const { id, kind, ...data } = x;
    if (
      [
        "bookings",
        "payments",
        "tasks",
        "quotes",
        "documents",
        "schedules",
        "changes",
        "expenses",
        "travelers",
        "communications",
      ].includes(kind) &&
      !(await env
        .DB!.prepare("SELECT id FROM records WHERE id=? AND kind=?")
        .bind(x.trip, "trips")
        .first())
    )
      throw Error("Choose a trip");
    if (
      kind === "payments" &&
      ![
        "Client payment",
        "Client refund",
        "Supplier payment",
        "Supplier refund",
        "Commission received",
      ].includes(x.type)
    )
      throw Error("Invalid payment type");
    if (x.start && x.end && x.end < x.start)
      throw Error("End date must follow start date");
    const rid = id || crypto.randomUUID();
    const prior = await env
      .DB!.prepare("SELECT data FROM records WHERE id=? AND kind=?")
      .bind(rid, kind)
      .first<{ data: string }>();
    await env
      .DB!.prepare(
        "INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated WHERE records.kind=excluded.kind",
      )
      .bind(rid, kind, JSON.stringify(data), new Date().toISOString())
      .run();
    await env
      .DB!.prepare("INSERT INTO records(id,kind,data,updated) VALUES(?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        "audit",
        JSON.stringify({
          name: (id ? "Updated " : "Created ") + kind + ": " + x.name,
          trip: x.trip || (kind === "trips" ? rid : ""),
          date: new Date().toISOString(),
          record: rid,
          before: prior ? JSON.parse(prior.data) : null,
          after: data,
        }),
        new Date().toISOString(),
      )
      .run();
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json(
      { error: e.message || "Unable to save" },
      { status: 400 },
    );
  }
}
