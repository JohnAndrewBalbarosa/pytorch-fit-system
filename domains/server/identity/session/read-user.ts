import { currentViewer } from "@pytorch-fit/domain-server/identity";

export async function currentProductUserId(): Promise<string | null> {
  return (await currentViewer()).userId;
}
