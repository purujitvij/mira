import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { q } from "@/lib/db";

const Body = z.object({ interventionId: z.string().min(1), helpful: z.boolean() });

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { interventionId, helpful } = parsed.data;
  await q("INSERT INTO feedback (user_id,intervention_id,helpful) VALUES ($1,$2,$3)", [userId, interventionId, helpful]);
  return Response.json({ ok: true });
}
