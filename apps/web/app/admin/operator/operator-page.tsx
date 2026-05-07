import Link from "next/link";
import { requireAdminSession } from "../../actions";
import { buildOperatorConsoleStatus, type OperatorCardId, type OperatorStatusCard } from "../../../src/mvp/operator-status";

const SECTIONS:{ href:string; label:string; ids:OperatorCardId[] }[] = [
  { href:"/admin/operator", label:"Overview", ids:["environment_validation", "admin_auth", "known_blockers", "release_readiness"] },
  { href:"/admin/operator/readiness", label:"Readiness", ids:["release_readiness", "privacy_controls", "monitoring_alerting", "known_blockers"] },
  { href:"/admin/operator/health", label:"Health", ids:["environment_validation", "admin_auth", "email_gateway", "line_gateway", "payment_provider", "notification_scheduler", "astro_calc"] },
  { href:"/admin/operator/notifications", label:"Notifications", ids:["notification_scheduler", "email_gateway", "line_gateway", "monitoring_alerting"] },
  { href:"/admin/operator/astro", label:"Astro", ids:["astro_calc", "release_readiness", "known_blockers"] },
  { href:"/admin/operator/payments", label:"Payments", ids:["payment_provider", "subscription_lifecycle", "monitoring_alerting"] },
];

export default async function OperatorConsolePage({ section = "Overview", selectedIds = SECTIONS[0]!.ids, path = "/admin/operator" }:{ section?:string; selectedIds?:OperatorCardId[]; path?:string }) {
  const adminSession = await requireAdminSession(path);
  const status = buildOperatorConsoleStatus();
  const cards = status.cards.filter((card)=>selectedIds.includes(card.id));

  return (
    <section className="page">
      <p className="eyebrow">Protected operator console</p>
      <h1>Beta operator console</h1>
      <p className="lead">
        {section} for {status.environment} mode. Admin actor {adminSession.actorId} is authenticated with role {adminSession.role}.
      </p>
      <div className={`guard status-${status.overallStatus}`}>
        Overall status: <strong>{status.overallStatus}</strong>. This console shows sanitized modes, status codes, warnings, and doc links only.
      </div>
      <nav className="operator-tabs" aria-label="Operator console sections">
        {SECTIONS.map((item)=>(
          <Link key={item.href} href={item.href}>{item.label}</Link>
        ))}
      </nav>
      <section className="grid operator-grid" aria-label={`${section} status cards`}>
        {cards.map((card)=><StatusCard key={card.id} card={card} />)}
      </section>
      <section className="panel">
        <h2>Readiness links</h2>
        <ul className="plain-list">
          {status.docLinks.map((link)=>(
            <li key={link.href}><a href={link.href}>{link.label}</a></li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function StatusCard({ card }:{ card:OperatorStatusCard }) {
  return (
    <article className={`panel status-card status-${card.status}`}>
      <span className="badge">{card.status}</span>
      <h2>{card.title}</h2>
      <p>{card.summary}</p>
      <dl className="status-meta">
        <div>
          <dt>Mode</dt>
          <dd>{card.mode}</dd>
        </div>
        <div>
          <dt>Blockers</dt>
          <dd>{card.blockers.length}</dd>
        </div>
      </dl>
      <ul className="plain-list">
        {card.details.map((detail)=>(
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      {card.blockers.length > 0 ? (
        <div className="guard">
          <strong>Blockers:</strong> {card.blockers.join(", ")}
        </div>
      ) : null}
      <div className="actions">
        {card.links.map((link)=>(
          <a key={link.href} className="button-link secondary" href={link.href}>{link.label}</a>
        ))}
      </div>
    </article>
  );
}
