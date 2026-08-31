"use client";
import { useRef, useState } from "react";
import { dayKey, monthCells } from "@/lib/days";

const Icon = ({ d }: { d: string }) => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const iconBtn = "flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage";
const keyOf = (y: number, m: number, d: number) => dayKey(new Date(y, m, d, 12).toISOString());

/** Streak card for the sidebar; the whole card opens a calendar of check-in days. Shown only at 2+ days running. */
export default function Streak({ streak, dayKeys }: { streak: number; dayKeys: string[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const now = new Date();
  const [{ y, m }, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const has = new Set(dayKeys);
  const today = dayKey(now.toISOString());
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now.getTime() - (6 - i) * 864e5); return { key: dayKey(d.toISOString()), label: d.toLocaleDateString("en-GB", { weekday: "narrow" }) }; });
  const cells = monthCells(y, m);
  const inMonth = dayKeys.filter((k) => k.startsWith(`${y}-${String(m + 1).padStart(2, "0")}-`)).length;
  const title = new Date(y, m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
        className="mt-6 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(30,26,22,0.04)] hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage">
        <span className="flex flex-col gap-0.5">
          <span className="font-serif text-[22px] leading-[1.1] font-medium text-sage-deep">{streak} days</span>
          <span className="text-[12px] text-ink-3">running</span>
        </span>
        <span className="flex items-end gap-[7px]" aria-label="Last seven days">
          {week.map((w) => (
            <span key={w.key} className="flex flex-col items-center gap-[5px]">
              <span className={`h-[7px] w-[7px] rounded-full ${has.has(w.key) ? "bg-sage" : "bg-line-2"} ${w.key === today ? "ring-[1.5px] ring-sage ring-offset-2 ring-offset-white" : ""}`} />
              <span className="text-[10px] leading-none text-ink-4">{w.label}</span>
            </span>
          ))}
        </span>
      </button>

      <dialog ref={dialog} aria-labelledby="streak-title" onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}
        className="m-auto w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_1px_2px_rgba(30,26,22,0.04),0_24px_48px_-24px_rgba(30,26,22,0.35)] backdrop:bg-ink/35">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Check-ins</span>
              <span id="streak-title" className="font-serif text-[26px] leading-[1.15] font-medium">{title}</span>
              <span className="text-[13px] text-ink-3">{streak >= 2 ? `${streak} days running · ` : ""}{inMonth} {inMonth === 1 ? "day" : "days"} this month</span>
            </div>
            <div className="flex gap-1.5">
              <button type="button" aria-label="Previous month" className={iconBtn} onClick={() => setMonth(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}><Icon d="M10 3 5 8l5 5" /></button>
              <button type="button" aria-label="Next month" className={iconBtn} onClick={() => setMonth(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}><Icon d="m6 3 5 5-5 5" /></button>
              <button type="button" aria-label="Close" className={`${iconBtn} ml-1.5`} onClick={() => dialog.current?.close()}><Icon d="M4 4l8 8M12 4l-8 8" /></button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-7">
              {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={i} className="flex h-6 items-center justify-center text-[11px] font-semibold tracking-[0.08em] text-ink-4">{w}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} className="h-11" />;
                const key = keyOf(y, m, d), on = has.has(key);
                // Consecutive check-in days share one band; a squared edge means the run continues into the next row.
                const band = on ? `bg-sage-soft ${has.has(keyOf(y, m, d - 1)) ? "" : "rounded-l-full"} ${has.has(keyOf(y, m, d + 1)) ? "" : "rounded-r-full"}` : "";
                return (
                  <span key={i} aria-label={on ? `${d}, checked in` : undefined} className={`flex h-11 items-center justify-center ${band}`}>
                    {key === today
                      ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage text-[14px] font-medium text-white">{d}</span>
                      : <span className={`text-[14px] ${on ? "font-medium text-sage-deep" : "text-ink-2"}`}>{d}</span>}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#efeae2] pt-3.5 text-[12px]">
            <div className="flex items-center gap-3.5 text-ink-3">
              <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-sage-soft" />Checked in</span>
              <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full bg-sage" />Today</span>
            </div>
            <span className="text-ink-4">Gaps are fine. Mira picks up where you left off.</span>
          </div>
        </div>
      </dialog>
    </>
  );
}
