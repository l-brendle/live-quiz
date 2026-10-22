"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { hostTokenKey, post, readStorage, writeStorage } from "@/lib/client";
import { Quiz, QuizParseError, SAMPLE_CONFIG, parseQuiz } from "@/lib/quiz";

const DRAFT_KEY = "quiz-draft";

const TYPE_LABEL = { choice: "Multiple choice", truefalse: "Right or wrong", text: "Free text" } as const;

export default function HostSetup() {
  const router = useRouter();
  const [config, setConfig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the last config so the host doesn't lose it on reload.
  useEffect(() => setConfig(readStorage(DRAFT_KEY) ?? SAMPLE_CONFIG), []);
  useEffect(() => {
    if (config !== null) writeStorage(DRAFT_KEY, config);
  }, [config]);

  const parsed = useMemo((): { quiz: Quiz } | { error: string } | null => {
    if (config === null) return null;
    try {
      return { quiz: parseQuiz(config) };
    } catch (e) {
      return { error: e instanceof QuizParseError ? e.message : String(e) };
    }
  }, [config]);

  const create = async () => {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const { code, hostToken } = await post<{ code: string; hostToken: string }>("/api/games", { config });
      writeStorage(hostTokenKey(code), hostToken);
      router.push(`/host/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="setup">
      <header className="setup-header">
        <Link href="/" className="logo logo-small">
          Live Quiz
        </Link>
        <span>Host setup</span>
      </header>
      <div className="setup-grid">
        <section className="card stack">
          <h2>Questions</h2>
          <textarea
            className="editor"
            spellCheck={false}
            value={config ?? ""}
            onChange={(e) => setConfig(e.target.value)}
            aria-label="Quiz config"
          />
          <div className="row">
            <button className="btn btn-primary" disabled={!parsed || "error" in parsed || busy} onClick={create}>
              {busy ? "Creating…" : "Create game"}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfig(SAMPLE_CONFIG)}>
              Load example
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="card stack">
          <h2>Preview</h2>
          {parsed && "error" in parsed && <p className="error">{parsed.error}</p>}
          {parsed && "quiz" in parsed && (
            <>
              <p>
                <strong>{parsed.quiz.title}</strong> · {parsed.quiz.questions.length} question
                {parsed.quiz.questions.length === 1 ? "" : "s"}
              </p>
              <ol className="preview-list">
                {parsed.quiz.questions.map((q, i) => (
                  <li key={i}>
                    <div className="preview-q">{q.question}</div>
                    <div className="muted">
                      {TYPE_LABEL[q.type]} · {q.time}s ·{" "}
                      {q.type === "choice"
                        ? `✓ ${q.options[q.answer]}`
                        : q.type === "truefalse"
                          ? `✓ ${q.answer ? "True" : "False"}`
                          : `✓ ${q.answer.join(" / ")}`}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          <details className="help">
            <summary>Format help</summary>
            <pre>{`title: My quiz          optional

? Question text         starts a question
time: 30                optional, seconds (default 20)
- Wrong option          multiple choice (2–4 options)
* Right option          exactly one marked with *

? Statement
= true                  right or wrong (= true / = false)

? Free text question
= Paris | Paris City    accepted answers, separated by |

# comment               ignored`}</pre>
            <p className="muted">
              Free-text answers ignore case, accents and punctuation. JSON is accepted too:
              {` {"title": "…", "questions": [{"type": "choice", "question": "…", "options": […], "answer": 1}]}`}
            </p>
          </details>
        </section>
      </div>
    </main>
  );
}
