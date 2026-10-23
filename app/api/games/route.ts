import { createGame } from "@/lib/game";
import { handle, readJson } from "@/lib/api";
import { isLanguage, parseQuiz } from "@/lib/quiz";

export async function POST(req: Request) {
  return handle(async () => {
    const { config, lang } = await readJson<{ config?: string; lang?: unknown }>(req);
    if (typeof config !== "string" || config.length > 100_000) throw new Error("Invalid config");
    return createGame(parseQuiz(config), isLanguage(lang) ? lang : "en");
  });
}
