import { currentViewer } from "@/lib/auth/viewer";

export async function currentProductUserId(): Promise<string | null> {
  return (await currentViewer()).userId;
}
