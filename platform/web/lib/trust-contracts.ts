import { z } from "zod";

export const memberPrivacySettingsSchema = z.object({
  hideGoogleIdentity: z.boolean(),
  hideRealName: z.boolean(),
  deviceCacheEnabled: z.boolean(),
  anonymousRanking: z.boolean(),
  automaticErrorReports: z.boolean(),
}).strict();

export type MemberPrivacySettings = z.infer<typeof memberPrivacySettingsSchema>;

export const feedbackReportSchema = z.object({
  category: z.enum(["bug", "broken_flow", "privacy", "security", "suggestion", "automatic_error"]),
  description: z.string().trim().max(1200).default(""),
  route: z.string().startsWith("/").max(240),
  uiState: z.object({
    title: z.string().max(160),
    viewport: z.string().regex(/^\d+x\d+$/),
    online: z.boolean(),
    componentMarkers: z.array(z.string().max(120)).max(40),
    error: z.string().max(300).optional(),
  }).strict(),
}).strict();

export type FeedbackReportInput = z.infer<typeof feedbackReportSchema>;
export type FeedbackReport = FeedbackReportInput & {
  id: string;
  portal: "member" | "officer";
  status: "received" | "triaged" | "resolved";
  createdAt: string;
};

export type MembershipStatus = {
  state: "prospective" | "payment_pending" | "active" | "rejected";
  paid: boolean;
  canEnterMemberPortal: boolean;
  paymentReference: string;
  updatedAt: string;
  demo: boolean;
};
