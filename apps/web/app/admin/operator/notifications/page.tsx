import OperatorConsolePage from "../operator-page";

export default function Page() {
  return <OperatorConsolePage section="Notifications" selectedIds={["notification_scheduler", "email_gateway", "line_gateway", "monitoring_alerting"]} path="/admin/operator/notifications" />;
}
