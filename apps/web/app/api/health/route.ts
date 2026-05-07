import { toPublicHealthReport, validateDeploymentEnvironment } from "../../../src/mvp/environment-validation";

export function GET():Response {
  const report = toPublicHealthReport(validateDeploymentEnvironment());
  return Response.json(report, { status:report.status === "ok" ? 200 : 503 });
}
