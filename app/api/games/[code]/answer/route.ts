import { submitAnswer } from "@/lib/game";
import { CodeParams, handle, readJson } from "@/lib/api";

export async function POST(req: Request, { params }: CodeParams) {
  const { code } = await params;
  return handle(async () => {
    const { playerId, index, value } = await readJson<{ playerId?: unknown; index?: unknown; value?: unknown }>(req);
    await submitAnswer(code, String(playerId ?? ""), Number(index), value);
  });
}
