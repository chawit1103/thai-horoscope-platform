import OperatorConsolePage from "../operator-page";

export default function Page() {
  return <OperatorConsolePage section="Payments" selectedIds={["payment_provider", "subscription_lifecycle", "monitoring_alerting"]} path="/admin/operator/payments" />;
}
