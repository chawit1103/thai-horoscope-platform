import OperatorConsolePage from "../operator-page";

export default function Page() {
  return <OperatorConsolePage section="Astro" selectedIds={["astro_calc", "release_readiness", "known_blockers"]} path="/admin/operator/astro" />;
}
