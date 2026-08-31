"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Event, Intervention, Resource } from "@/agents/types";

type Turn = { role: "user" | "assistant"; text: string; intervention?: Intervention | null; crisis?: Resource[]; pattern?: string | null; level?: string; requestId?: string; rated?: boolean };

const pill = "h-10 rounded-full px-4 text-[13px] font-medium transition-colors";
const PhoneIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 2h2.5l1.2 3-1.5 1a8 8 0 0 0 4.3 4.3l1-1.5 3 1.2v2.5a1.5 1.5 0 0 1-1.6 1.5A12 12 0 0 1 2 3.6 1.5 1.5 0 0 1 3.5 2z" /></svg>;

export default function Home() {
  const [userId, setUserId] = useState("");
  const [mode, setMode] = useState<"agent" | "baseline">("agent");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem("mira:user") ?? `u-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("mira:user", id); setUserId(id);
    } catch { setUserId("anon"); }
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput(""); setBusy(true);
    setTurns((t) => [...t, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, message, mode }) });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const patch = (p: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
      setTurns((ts) => { const c = [...ts]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, ...(typeof p === "function" ? p(last) : p) }; return c; });
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6)) as Event;
        if (ev.type === "token") patch((t) => ({ text: t.text + ev.text }));
        else if (ev.type === "safety") patch({ level: ev.level });
        else if (ev.type === "crisis") patch({ text: ev.text, crisis: ev.resources });
        else if (ev.type === "intervention") patch({ intervention: ev.intervention });
        else if (ev.type === "pattern") patch({ pattern: ev.text });
        else if (ev.type === "done") patch({ requestId: ev.requestId });
      }
    }
    setBusy(false);
  }

  async function feedback(turnIndex: number, interventionId: string, helpful: boolean) {
    setTurns((ts) => ts.map((t, i) => (i === turnIndex ? { ...t, rated: helpful } : t)));
    const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, interventionId, helpful }) });
    if (!res.ok) setTurns((ts) => ts.map((t, i) => (i === turnIndex ? { ...t, rated: undefined } : t)));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b border-line px-4 sm:px-10">
        <div className="flex items-baseline gap-3.5">
          <span className="font-serif text-2xl font-medium tracking-[0.04em]">MIRA</span>
          <span className="hidden text-[13px] text-ink-3 md:inline">A place to check in. Not a therapist, not a crisis line, never a diagnosis.</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div role="radiogroup" aria-label="Mode" className="flex gap-0.5 rounded-full bg-sand p-[3px]">
            {(["agent", "baseline"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={`h-10 rounded-full px-3.5 text-[13px] font-medium capitalize ${mode === m ? "bg-white text-ink shadow-[0_1px_2px_rgba(30,26,22,0.08)]" : "text-ink-2"}`}>{m}</button>
            ))}
          </div>
          <Link href="/review" className="text-[13px] font-medium text-ink-2 hover:text-ink">Review queue</Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-7 px-5 py-9 sm:px-0">
        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} className="flex flex-col items-end">
            <div className="max-w-[80%] rounded-[18px] rounded-br-[4px] bg-sand px-4 py-3 text-[15px] leading-normal whitespace-pre-wrap">{t.text}</div>
          </div>
        ) : (
          <div key={i} className="flex max-w-[640px] flex-col gap-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Mira</span>

            {t.pattern && (
              <div className="inline-flex items-center gap-2 self-start rounded-full bg-sage-soft py-1.5 pr-3 pl-2.5 text-[13px] text-sage-deep">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 11.5 6 7.5l3 3 5-6" /><path d="M11 4.5h3v3" /></svg>
                <span>I noticed: {t.pattern}</span>
              </div>
            )}

            {t.crisis ? (
              <div className="flex flex-col gap-5 rounded-2xl border border-rose-line bg-white p-6 shadow-[0_1px_2px_rgba(30,26,22,0.04),0_12px_32px_-18px_rgba(180,69,63,0.35)] sm:p-7">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5 text-rose">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 3 2.5 16h15L10 3z" /><path d="M10 8v4M10 14.5v.01" /></svg>
                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">Please reach a real person now</span>
                  </div>
                  <p className="font-serif text-[19px] leading-[1.55] text-pretty">{t.text}</p>
                </div>
                <ul className="flex flex-col border-t border-rose-soft">
                  {t.crisis.map((r, j) => (
                    <li key={r.name} className="flex flex-col gap-3 border-b border-rose-soft py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-medium">{r.name}</span>
                        <span className="text-[13px] text-ink-3">{r.purpose}</span>
                      </div>
                      <a href={`tel:${r.contact.split(" or ")[0].replace(/[^\d+]/g, "")}`}
                        className={`flex h-11 items-center gap-2.5 self-start rounded-full px-[18px] text-[17px] font-medium tabular-nums whitespace-nowrap sm:self-auto ${j === 0 ? "bg-rose text-white hover:bg-[#9d3b36]" : "border border-[#e8b7b3] bg-white text-rose hover:bg-rose-soft"}`}>
                        <PhoneIcon /><span>{r.contact}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px] leading-normal text-ink-2">This message has also been sent to a human reviewer.</p>
              </div>
            ) : (
              <p className="font-serif text-[19px] leading-[1.55] text-pretty whitespace-pre-wrap">{t.text || (busy ? <span className="text-ink-4">…</span> : "")}</p>
            )}

            {t.intervention && (
              <div className="flex flex-col gap-4 rounded-[14px] border border-line bg-white px-6 py-[22px] shadow-[0_1px_2px_rgba(30,26,22,0.04),0_8px_24px_-16px_rgba(30,26,22,0.18)]">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[22px] font-medium">{t.intervention.title}</span>
                  <span className="rounded-full bg-ground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-2">{t.intervention.minutes} min · {t.intervention.category}</span>
                </div>
                <ol className="flex flex-col gap-2.5">
                  {t.intervention.steps.map((s, n) => (
                    <li key={s} className="flex items-baseline gap-3.5 text-[15px] leading-normal"><span className="w-4 text-right font-serif text-sage">{n + 1}</span><span>{s}</span></li>
                  ))}
                </ol>
                <div className="flex items-center justify-between border-t border-[#efeae2] pt-3.5">
                  <span className="text-[13px] text-ink-3">{t.rated === undefined ? "Did this help?" : t.rated ? "Noted — I'll suggest this again." : "Noted — I'll try something else next time."}</span>
                  <div className="flex gap-2">
                    <button onClick={() => feedback(i, t.intervention!.id, true)} disabled={t.rated !== undefined} aria-pressed={t.rated === true}
                      className={`${pill} ${t.rated === true ? "bg-sage-deep text-white" : "bg-sage text-white hover:bg-sage-deep"} disabled:cursor-default disabled:opacity-60 aria-pressed:opacity-100`}>It helped</button>
                    <button onClick={() => feedback(i, t.intervention!.id, false)} disabled={t.rated !== undefined} aria-pressed={t.rated === false}
                      className={`${pill} border border-line-2 bg-white text-ink-2 hover:bg-ground disabled:cursor-default disabled:opacity-60 aria-pressed:opacity-100 aria-pressed:border-ink-2`}>Didn&apos;t help</button>
                  </div>
                </div>
              </div>
            )}

            {t.requestId && (
              <a href={`/trace/${t.requestId}`} className="inline-flex items-center gap-1.5 self-start text-xs text-ink-4 hover:text-ink-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M2 8h3l2-4 2 8 2-4h3" /></svg>
                <span>View trace{t.level ? ` · safety ${t.level}` : ""}</span>
              </a>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </main>

      <footer className="mx-auto flex w-full max-w-[720px] flex-col gap-2.5 px-5 pb-7 sm:px-0">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2.5 rounded-2xl border border-line-2 bg-white p-2 pl-[18px] shadow-[0_1px_2px_rgba(30,26,22,0.04)] focus-within:border-ink-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="How are you doing today?" aria-label="Message"
            className="flex-1 bg-transparent py-2.5 text-[15px] leading-normal outline-none placeholder:text-ink-3" />
          <button disabled={busy} className="flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-white disabled:opacity-50">
            <span>Send</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </button>
        </form>
        <div className="flex justify-between px-1.5 text-xs text-ink-3">
          <span className="hidden sm:inline">Enter to send</span>
          <span>If you&apos;re in danger, call your local emergency number.</span>
        </div>
      </footer>
    </div>
  );
}
