"use client";
import Link from "next/link";
import { UserButton, useSession, useUser } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Event, Intervention, Resource } from "@/agents/types";
import { dayKey, since, runningDays } from "@/lib/days";
import { groupConvs } from "@/lib/convs";
import Streak from "./streak";

type Turn = { role: "user" | "assistant"; text: string; at: string; domain?: string; intervention?: Intervention | null; crisis?: Resource[]; pattern?: string | null; level?: string; requestId?: string; rated?: boolean };
type Row = { conversation_id: string | null; role: "user" | "assistant"; content: string; safety_level: string | null; created_at: string; state: { domain?: string } | null };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toTurn = (r: Row): Turn => ({ role: r.role, text: r.content, level: r.safety_level ?? undefined, at: r.created_at, domain: r.state?.domain });
const toRow = (cid: string) => (t: Turn): Row => ({ conversation_id: cid, role: t.role, content: t.text, safety_level: t.level ?? null, created_at: t.at, state: t.domain ? { domain: t.domain } : null });
const cidOf = (r: Row) => r.conversation_id ?? "legacy";

const onMind: Record<string, string> = { work: "work was on your mind", sleep: "sleep was on your mind", relationships: "someone close to you was on your mind", health: "your health was on your mind" };
const timeOfDay = () => { const h = new Date().getHours(); return h < 5 ? "Hi" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const pill = "h-10 rounded-full px-4 text-[13px] font-medium transition-colors";
const PhoneIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 2h2.5l1.2 3-1.5 1a8 8 0 0 0 4.3 4.3l1-1.5 3 1.2v2.5a1.5 1.5 0 0 1-1.6 1.5A12 12 0 0 1 2 3.6 1.5 1.5 0 0 1 3.5 2z" /></svg>;

export default function Chat({ openReviews }: { openReviews: number | null }) {
  const [mode, setMode] = useState<"agent" | "baseline">("agent");
  const [turns, setTurns] = useState<Turn[]>([]); // the thread on screen — the current conversation only
  const [past, setPast] = useState<Row[]>([]); // every other saved message, chronological
  const [convId, setConvId] = useState(() => crypto.randomUUID()); // page load = new chat
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const { session } = useSession();
  const { user } = useUser();
  const [loaded, setLoaded] = useState(false);

  // Browser reads its own history straight from Supabase: Clerk session token → RLS on user_id. Writes stay server-side.
  // ponytail: past turns are text-only (no intervention cards / crisis resources) — rebuild from intervention_id if wanted.
  const supabase = useMemo(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { accessToken: async () => (await session?.getToken()) ?? null }), [session]);
  useEffect(() => {
    if (!session) return;
    supabase.from("messages").select("conversation_id,role,content,safety_level,created_at,state").order("created_at").limit(200)
      .then(({ data, error }) => {
        if (error) { console.error("history_failed", error.message); return; }
        setPast((cur) => (cur.length ? cur : ((data ?? []) as Row[])));
        setLoaded(true);
      });
  }, [session, supabase]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  const convs = groupConvs(past.map((r) => ({ id: cidOf(r), role: r.role, text: r.content, at: r.created_at }))
    .concat(turns.filter((t) => t.text).map((t) => ({ id: convId, role: t.role, text: t.text, at: t.at }))));
  const everything = [...past.map(toTurn), ...turns].sort((a, b) => a.at.localeCompare(b.at));
  const streak = runningDays([...new Set(everything.map((t) => dayKey(t.at)))]);

  // MIRA speaks first. Deterministic, from what is actually on record — no model call, nothing invented.
  const name = user?.firstName ? `, ${user.firstName}` : "";
  const lastUser = [...everything].reverse().find((t) => t.role === "user");
  const greeting = !loaded ? null : !lastUser
    ? `${timeOfDay()}${name}. I'm Mira. This is a place to check in — how you're doing, what's on your mind. Nothing you say here has to be tidy. How are you today?`
    : `${timeOfDay()}${name}, good to see you again. We last talked ${since(lastUser.at)}${lastUser.domain && onMind[lastUser.domain] ? ` — ${onMind[lastUser.domain]}` : ""}. How has it been since?`;

  /** Fold the on-screen thread back into `past`, then show `id` (or a fresh chat when null). */
  function switchTo(id: string | null) {
    if (busy || id === convId) return;
    setPast((p) => [...p.filter((r) => cidOf(r) !== convId), ...turns.filter((t) => t.text).map(toRow(convId))].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    // ponytail: rows from before this feature have no conversation_id; replying to that thread starts a fresh one
    setConvId(id !== null && uuidRe.test(id) ? id : crypto.randomUUID());
    setTurns(id === null ? [] : past.filter((r) => cidOf(r) === id).map(toTurn));
  }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput(""); setBusy(true);
    const at = new Date().toISOString();
    setTurns((t) => [...t, { role: "user", text: message, at }, { role: "assistant", text: "", at }]);
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, mode, conversationId: convId }) });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let pending: Intervention | null = null; // card appears only once the reply has finished streaming
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
        else if (ev.type === "intervention") pending = ev.intervention;
        else if (ev.type === "pattern") patch({ pattern: ev.text });
        else if (ev.type === "done") patch({ requestId: ev.requestId, intervention: pending });
      }
    }
    setBusy(false);
  }

  async function feedback(turnIndex: number, interventionId: string, helpful: boolean) {
    setTurns((ts) => ts.map((t, i) => (i === turnIndex ? { ...t, rated: helpful } : t)));
    const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ interventionId, helpful }) });
    if (!res.ok) setTurns((ts) => ts.map((t, i) => (i === turnIndex ? { ...t, rated: undefined } : t)));
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-ground px-6 py-7 md:flex">
        <div className="flex flex-col gap-1.5">
          <span className="font-serif text-2xl font-medium tracking-[0.04em]">MIRA</span>
          <span className="text-[12px] leading-snug text-ink-3">A place to check in.</span>
        </div>

        <nav aria-label="Conversations" className="mt-9 flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Chats</span>
            <button onClick={() => switchTo(null)} className="rounded-full px-2 py-1 text-[12px] font-medium text-sage-deep hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage">+ New chat</button>
          </div>
          {convs.length === 0 ? (
            <p className="text-[13px] leading-snug text-ink-4">Your first check-in will appear here.</p>
          ) : (
            <ol className="flex flex-col gap-1 overflow-y-auto">
              {convs.map((c) => { const active = c.id === convId; return (
                <li key={c.id}>
                  <button onClick={() => switchTo(c.id)} aria-current={active ? "true" : undefined}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${active ? "bg-sand" : ""}`}>
                    <span className={`text-[13px] ${active ? "font-medium text-ink" : "text-ink-2"}`}>{c.label}</span>
                    <span className="w-full truncate text-[12px] text-ink-4">{c.snippet || "…"}</span>
                  </button>
                </li>
              ); })}
            </ol>
          )}
        </nav>

        {streak >= 2 && <Streak streak={streak} dayKeys={[...new Set(everything.map((t) => dayKey(t.at)))]} />}

        {openReviews !== null && (
          <Link href="/review" className={`${streak >= 2 ? "mt-2" : "mt-6"} flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage`}>
            <span>Review queue</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] tabular-nums ${openReviews > 0 ? "bg-rose-soft text-rose" : "bg-ground text-ink-4"}`}>{openReviews}</span>
          </Link>
        )}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      <header className="flex h-16 items-center justify-between border-b border-line px-4 sm:px-10">
        <div className="flex items-baseline gap-3.5">
          <span className="font-serif text-2xl font-medium tracking-[0.04em] md:hidden">MIRA</span>
          <span className="hidden text-[13px] text-ink-3 md:inline">A place to check in. Not a therapist, not a crisis line, never a diagnosis.</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div role="radiogroup" aria-label="Mode" className="flex gap-0.5 rounded-full bg-sand p-[3px]">
            {(["agent", "baseline"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={`h-10 rounded-full px-3.5 text-[13px] font-medium capitalize ${mode === m ? "bg-white text-ink shadow-[0_1px_2px_rgba(30,26,22,0.08)]" : "text-ink-2"}`}>{m}</button>
            ))}
          </div>
          {openReviews !== null && <Link href="/review" className="text-[13px] font-medium text-ink-2 hover:text-ink md:hidden">Review queue{openReviews > 0 ? ` · ${openReviews}` : ""}</Link>}
          <UserButton />
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
        {greeting && !busy && turns.length === 0 && (
          <div className="flex max-w-[640px] flex-col gap-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Mira</span>
            <p className="font-serif text-[19px] leading-[1.55] text-pretty">{greeting}</p>
          </div>
        )}
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
    </div>
  );
}
