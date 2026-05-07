import { notFound } from "next/navigation";
import { isDevMockAdminLoginEnabled } from "../../../src/mvp/admin-auth";
import { readDeploymentEnvironment } from "../../../src/mvp/environment-validation";
import { startDevMockAdminSessionAction } from "../../actions";

export default function AdminSignInPage() {
  if (!isDevMockAdminLoginEnabled({ isProduction: process.env.NODE_ENV === "production", deploymentEnvironment: readDeploymentEnvironment() })) {
    notFound();
  }

  return (
    <section className="page">
      <p className="eyebrow">Non-production admin sign-in</p>
      <h1>Protected admin access</h1>
      <p className="lead">This mock admin sign-in is available only outside production deployments.</p>
      <form className="form-panel" action={startDevMockAdminSessionAction}>
        <label>
          Mock admin token
          <input name="adminToken" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </section>
  );
}
