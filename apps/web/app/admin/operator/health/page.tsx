import OperatorConsolePage from "../operator-page";

export default function Page() {
  return <OperatorConsolePage section="Health" selectedIds={["environment_validation", "admin_auth", "email_gateway", "line_gateway", "payment_provider", "notification_scheduler", "astro_calc"]} path="/admin/operator/health" />;
}
