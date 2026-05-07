import { cookies } from "next/headers";

export async function getOptionalMockSession():Promise<{ sessionId:string; userId:string }|undefined> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("mock-session-id")?.value;
  const userId = cookieStore.get("mock-user-id")?.value;
  return sessionId && userId ? { sessionId, userId } : undefined;
}
