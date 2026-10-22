import { NextResponse } from "next/server";
import { GameError } from "./game";
import { QuizParseError } from "./quiz";

export type CodeParams = { params: Promise<{ code: string }> };

/** Runs a route handler, turning thrown game errors into JSON error responses. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof QuizParseError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new GameError("Invalid request body.");
  }
}
