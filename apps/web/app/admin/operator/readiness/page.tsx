import OperatorConsolePage from "../operator-page";

export default function Page() {
  return <OperatorConsolePage section="Readiness" selectedIds={["release_readiness", "privacy_controls", "monitoring_alerting", "known_blockers"]} path="/admin/operator/readiness" />;
}
