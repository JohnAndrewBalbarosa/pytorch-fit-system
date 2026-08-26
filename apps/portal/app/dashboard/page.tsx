import { DashboardCommandCenter } from "@pytorch-fit/domain-client/organization";
import { MemberDashboard } from "@pytorch-fit/domain-client/leaderboards";
import { portalAudience } from "@pytorch-fit/domain-server/identity";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return await portalAudience() === "officer" ? <DashboardCommandCenter /> : <MemberDashboard />;
}
