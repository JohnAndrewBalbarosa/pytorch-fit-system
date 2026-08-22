import { z } from "zod";
import { isSchoolEmail } from "./permissions";
import { leaderboardUsernameSchema } from "./member-command-contracts";

const schoolEmail = z.string().email("Enter a valid school email.").refine(isSchoolEmail, "Use @fit.edu.ph or @feutech.edu.ph.");
export const loginSchema = z.object({ email: schoolEmail, password: z.string().min(8, "Password must have at least 8 characters."), remember: z.boolean() });
export const registerSchema = z.object({ name: z.string().trim().min(2, "Enter your full name."), username: leaderboardUsernameSchema, email: schoolEmail, password: z.string().min(8, "Password must have at least 8 characters."), confirm: z.string(), terms: z.boolean().refine(Boolean, "Accept the community guidelines to continue.") }).refine((value) => value.password === value.confirm, { message: "Passwords must match.", path: ["confirm"] });
export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
