import { NextResponse } from "next/server";
import { currentProductUserId } from "@/lib/auth/current-user";
import { demoProductView } from "@/lib/product/demo";
import { configuredProductProvider } from "@/lib/product/repository";
import { updateLocalDemoState } from "@/lib/product/local-demo-state";

type RequestBody = {
  action?: "advance_opportunity" | "approve_review" | "toggle_event";
  id?: string;
};

const stages = ["discovered", "drafted", "human_review", "demo_confirmed"];

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || configuredProductProvider() !== "local") {
    return NextResponse.json({ error: "Demo actions are unavailable." }, { status: 404 });
  }
  const userId = await currentProductUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as RequestBody;
  if (!body.action || !body.id) return NextResponse.json({ error: "A demo action and record ID are required." }, { status: 400 });
  const action = body.action;
  const id = body.id;
  const fixture = demoProductView("dashboard");

  try {
    const state = updateLocalDemoState(userId, (current) => {
      if (action === "advance_opportunity") {
        const opportunity = fixture.opportunities?.find((item) => item.id === id);
        if (!opportunity) throw new Error("Unknown synthetic opportunity.");
        const stage = current.opportunityStages[id] || opportunity.stage;
        const position = stages.indexOf(stage);
        if (stage === "demo_confirmed") throw new Error("This simulation is already confirmed.");
        return { ...current, opportunityStages: { ...current.opportunityStages, [id]: stages[Math.min(stages.length - 1, Math.max(0, position) + 1)] } };
      }
      if (action === "approve_review") {
        if (!fixture.operations?.reviews.some((item) => item.id === id)) throw new Error("Unknown synthetic review gate.");
        return { ...current, approvedReviewIds: [...new Set([...current.approvedReviewIds, id])] };
      }
      if (action === "toggle_event") {
        if (!fixture.events?.some((item) => item.id === id)) throw new Error("Unknown synthetic event.");
        const registered = current.registeredEventIds.includes(id);
        return { ...current, registeredEventIds: registered ? current.registeredEventIds.filter((eventId) => eventId !== id) : [...current.registeredEventIds, id] };
      }
      throw new Error("Unsupported demo action.");
    });
    return NextResponse.json({ ok: true, state }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo action failed." }, { status: 400 });
  }
}
