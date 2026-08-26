import { z } from "zod";

export const evidenceFormSchema = z.object({
  title: z.string().trim().min(2, "Add a descriptive achievement title."),
  organization: z.string().trim().min(2, "Add the source organization."),
  role: z.string().trim().min(2, "Add your role."),
  dateLabel: z.string().trim().min(2, "Add the evidence date."),
  description: z.string().trim().min(10, "Describe the evidence in at least 10 characters."),
  skillsText: z.string().trim().min(1, "Add at least one evidenced skill."),
});

export type EvidenceFormValues = z.infer<typeof evidenceFormSchema>;
