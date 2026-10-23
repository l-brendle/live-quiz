"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/\D/g, "");

  return (
    <main className="center-page">
      <h1 className="logo">Live Quiz</h1>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length === 6) router.push(`/play/${clean}`);
        }}
      >
        <input
          className="input input-big"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Game code"
          value={code}
          maxLength={7}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Game code"
        />
        <button className="btn btn-dark" disabled={clean.length !== 6}>
          Enter
        </button>
      </form>
      <Link href="/host" className="link-light">
        Host a quiz →
      </Link>
    </main>
  );
}
