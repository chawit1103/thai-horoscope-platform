import { notFound } from "next/navigation";
import { isDevMockAdminLoginEnabled, startDevMockAdminSessionAction } from "../../actions";

export default function AdminSignInPage() {
  if (!isDevMockAdminLoginEnabled({ isProduction: process.env.NODE_ENV === "production" })) {
    notFound();
  }

  return (
    <section className="page">
      <p className="eyebrow">Development admin sign-in</p>
      <h1>Protected admin access</h1>
      <p className="lead">This mock admin sign-in is available only outside production.</p>
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
