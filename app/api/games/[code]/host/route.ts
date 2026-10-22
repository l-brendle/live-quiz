import { hostView } from "@/lib/game";
import { CodeParams, handle } from "@/lib/api";

export async function GET(req: Request, { params }: CodeParams) {
  const { code } = await params;
  return handle(() => hostView(code, req.headers.get("x-host-token")));
}
