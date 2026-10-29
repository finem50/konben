import { NextResponse } from "next/server";
import { getSqlite } from "@/db";

export const dynamic = "force-dynamic";

/** Used by the container healthcheck: proves the process is up and the volume is writable. */
export async function GET() {
  try {
    getSqlite().prepare("SELECT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
