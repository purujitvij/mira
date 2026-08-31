import { z } from "zod";
import { runAgent } from "@/agents/pipeline";
import { runBaseline } from "@/agents/baseline";
import { newCtx } from "@/agents/pipeline";

export const maxDuration = 60; // Vercel: an agent turn is 3 model calls + a streamed reply; the default 10 s is too short

const Body = z.object({ userId: z.string().min(1).max(64), message: z.string().min(1).max(4000), mode: z.enum(["agent", "baseline"]).default("agent") });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { userId, message, mode } = parsed.data;
  const ctx = newCtx(userId);
  const gen = mode === "baseline" ? runBaseline(ctx, message) : runAgent(ctx, message);

  // On client disconnect we keep draining the generator so the turn is still persisted.
  let aborted = false;
  request.signal.addEventListener("abort", () => { aborted = true; });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of gen) {
          if (aborted) continue;
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`)); } catch { aborted = true; }
        }
      } catch (e) {
        console.error("pipeline_failed", e);
        if (!aborted) controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "token", text: "Something went wrong on my side. Please try again in a moment." })}\n\n`));
      } finally {
        if (!aborted) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": ctx.requestId } });
}
