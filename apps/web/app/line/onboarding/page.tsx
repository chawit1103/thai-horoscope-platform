import { redirect } from "next/navigation";
import { getMockMvpState } from "../../../src/mvp/mock-flow";
import { canAccessBetaOnlyFlow } from "../../../src/mvp/beta-launch";
import { getOptionalMockSession } from "../../user-session";
import { LineOnboardingForm } from "../line-onboarding-form";

export default async function LineOnboardingPage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  if (!session || !canAccessBetaOnlyFlow({ state, sessionId:session.sessionId, userId:session.userId })) redirect("/beta");
  const profile = [...state.birthProfiles].reverse().find((item)=>item.userId === session.userId);
  return <LineOnboardingForm mode={profile ? "edit" : "create"} profile={profile} />;
}
