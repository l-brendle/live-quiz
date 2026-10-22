import { joinGame } from "@/lib/game";
import { CodeParams, handle, readJson } from "@/lib/api";

export async function POST(req: Request, { params }: CodeParams) {
  const { code } = await params;
  return handle(async () => {
    const { name, playerId } = await readJson<{ name?: unknown; playerId?: unknown }>(req);
    return joinGame(code, String(name ?? ""), typeof playerId === "string" ? playerId : undefined);
  });
}
