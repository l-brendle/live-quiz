import { gameInfo } from "@/lib/game";
import { CodeParams, handle } from "@/lib/api";

export async function GET(_req: Request, { params }: CodeParams) {
  const { code } = await params;
  return handle(() => gameInfo(code));
}
