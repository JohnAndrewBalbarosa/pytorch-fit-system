import { DashboardCommandCenter } from "@/components/dashboard-command-center";
import { MemberDashboard } from "@/components/member-dashboard";
import { portalAudience } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return portalAudience() === "officer" ? <DashboardCommandCenter /> : <MemberDashboard />;
}
