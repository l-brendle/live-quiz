import { playerView } from "@/lib/game";
import { CodeParams, handle } from "@/lib/api";

export async function GET(req: Request, { params }: CodeParams) {
  const { code } = await params;
  const playerId = new URL(req.url).searchParams.get("pid") ?? "";
  return handle(() => playerView(code, playerId));
}
