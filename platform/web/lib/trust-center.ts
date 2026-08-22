import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ViewerContext } from "./auth/viewer";
import { configuredProductProvider } from "./product/repository";
import { localDemoDatabasePath, readLocalDemoState, updateLocalDemoState } from "./product/local-demo-state";
import { createSupabaseServerClient } from "./supabase/server";
import {
  feedbackReportSchema,
  memberPrivacySettingsSchema,
  type FeedbackReport,
  type FeedbackReportInput,
  type MemberPrivacySettings,
  type MembershipStatus,
} from "./trust-contracts";

export async function readPrivacySettings(userId: string): Promise<MemberPrivacySettings> {
  if (configuredProductProvider() === "local") return readLocalDemoState(userId).privacySettings;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("member_privacy_settings");
  if (error || !data) throw new Error(error?.message || "Privacy settings are unavailable.");
  return memberPrivacySettingsSchema.parse(data);
}

export async function savePrivacySettings(userId: string, input: unknown): Promise<MemberPrivacySettings> {
  const value = memberPrivacySettingsSchema.parse(input);
  if (configuredProductProvider() === "local") {
    updateLocalDemoState(userId, (state) => ({
      ...state,
      privacySettings: value,
      leaderboardIdentity: {
        ...state.leaderboardIdentity,
        mode: value.anonymousRanking ? "anonymous" : state.leaderboardIdentity.mode === "anonymous" ? "nickname" : state.leaderboardIdentity.mode,
        realNameConsent: value.hideRealName ? false : state.leaderboardIdentity.realNameConsent,
      },
    }));
    return value;
  }
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("update_member_privacy_settings", { requested: value });
  if (error || !data) throw new Error(error?.message || "Privacy settings could not be saved.");
  return memberPrivacySettingsSchema.parse(data);
}

function openFeedbackDatabase() {
  const db = new DatabaseSync(localDemoDatabasePath());
  db.exec(`CREATE TABLE IF NOT EXISTS product_feedback (
    id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, portal TEXT NOT NULL,
    category TEXT NOT NULL, description TEXT NOT NULL, route TEXT NOT NULL,
    ui_state_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  ) STRICT;`);
  return db;
}

export async function createFeedbackReport(viewer: ViewerContext, input: unknown): Promise<FeedbackReport> {
  if (!viewer.userId && !viewer.localDevelopment) throw new Error("Authentication required.");
  const value = feedbackReportSchema.parse(input) as FeedbackReportInput;
  const report: FeedbackReport = {
    ...value,
    id: randomUUID(),
    portal: viewer.audience,
    status: "received",
    createdAt: new Date().toISOString(),
  };
  if (configuredProductProvider() === "local") {
    const db = openFeedbackDatabase();
    try {
      db.prepare("INSERT INTO product_feedback VALUES (?,?,?,?,?,?,?,?,?)").run(
        report.id, viewer.userId || "local-anonymous", report.portal, report.category,
        report.description, report.route, JSON.stringify(report.uiState), report.status, report.createdAt,
      );
    } finally { db.close(); }
    return report;
  }
  const client = await createSupabaseServerClient();
  const { error } = await client.from("product_feedback").insert({
    id: report.id, reporter_id: viewer.userId, portal: report.portal,
    category: report.category, description: report.description, route: report.route,
    ui_state: report.uiState, status: report.status,
  });
  if (error) throw new Error(error.message);
  return report;
}

export async function readFeedbackReports(viewer: ViewerContext): Promise<FeedbackReport[]> {
  if (!viewer.userId) return [];
  if (configuredProductProvider() === "local") {
    const db = openFeedbackDatabase();
    try {
      const rows = viewer.isOfficer
        ? db.prepare("SELECT * FROM product_feedback ORDER BY created_at DESC LIMIT 20").all()
        : db.prepare("SELECT * FROM product_feedback WHERE reporter_id=? ORDER BY created_at DESC LIMIT 20").all(viewer.userId);
      return rows.map((row) => ({
        id: String(row.id), portal: String(row.portal) as FeedbackReport["portal"],
        category: String(row.category) as FeedbackReport["category"], description: String(row.description),
        route: String(row.route), uiState: JSON.parse(String(row.ui_state_json)),
        status: String(row.status) as FeedbackReport["status"], createdAt: String(row.created_at),
      }));
    } finally { db.close(); }
  }
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("product_feedback").select("id,portal,category,description,route,ui_state,status,created_at").order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    portal: row.portal as FeedbackReport["portal"],
    category: row.category as FeedbackReport["category"],
    description: row.description,
    route: row.route,
    uiState: row.ui_state as FeedbackReport["uiState"],
    status: row.status as FeedbackReport["status"],
    createdAt: row.created_at,
  }));
}

export async function readMembershipStatus(viewer: ViewerContext, forcePending = false): Promise<MembershipStatus> {
  if (forcePending && viewer.localDevelopment) return {
    state: "payment_pending", paid: false, canEnterMemberPortal: false,
    paymentReference: "DEMO-PENDING-2026", updatedAt: new Date().toISOString(), demo: true,
  };
  if (configuredProductProvider() === "local") return {
    state: "active", paid: true, canEnterMemberPortal: true,
    paymentReference: "DEMO-ACTIVE-2026", updatedAt: new Date().toISOString(), demo: true,
  };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("current_membership_status");
  if (error || !data) throw new Error(error?.message || "Membership status is unavailable.");
  return data as unknown as MembershipStatus;
}
