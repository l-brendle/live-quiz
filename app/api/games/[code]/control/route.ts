import { ControlAction, control } from "@/lib/game";
import { CodeParams, handle, readJson } from "@/lib/api";

export async function POST(req: Request, { params }: CodeParams) {
  const { code } = await params;
  return handle(async () => control(code, req.headers.get("x-host-token"), await readJson<ControlAction>(req)));
}
