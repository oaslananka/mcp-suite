export interface AtlasHealth {
  status: "online" | "offline" | "degraded";
  liveness: "reachable" | "unreachable" | "unknown";
  readiness: "ready" | "not_ready" | "unknown";
  capabilityStatus: "verified" | "not_supported" | "failed" | "not_checked";
  responseMs: number;
  checkedAt: string;
  lastSuccessfulAt?: string;
  negotiatedProtocolVersion?: string;
  failureCategory?: string;
  failureMessage?: string;
  toolCount?: number;
}

export interface AtlasServer {
  id: string;
  name: string;
  description: string;
  author: string;
  packageName: string;
  tags: string[];
  verified: boolean;
  downloads: number;
  qualityScore?: number;
  installCommand: string;
  health?: AtlasHealth;
}

interface ServerCardProps {
  server: AtlasServer;
  onOpen: (id: string) => void;
}

export function ServerCard({ server, onOpen }: ServerCardProps): JSX.Element {
  return (
    <article className="server-card">
      <div className="server-card__header">
        <div>
          <p className="eyebrow">{server.author}</p>
          <h3>{server.name}</h3>
        </div>
        <div className="score-pill">{server.qualityScore ?? 0}/100</div>
      </div>
      <p className="server-card__description">{server.description}</p>
      <div className="meta-row">
        <span>{server.packageName}</span>
        <span>{server.downloads.toLocaleString()} downloads</span>
      </div>
      <div className="tag-stack">
        {server.tags.map((tag) => (
          <span key={tag} className="tag muted">
            {tag}
          </span>
        ))}
        {server.verified ? <span className="tag verified">Verified</span> : null}
        {server.health ? (
          <>
            <span className={`tag health-${server.health.liveness}`}>
              Liveness: {server.health.liveness}
            </span>
            <span className={`tag health-${server.health.readiness}`}>
              MCP: {server.health.readiness === "ready" ? "ready" : "not ready"}
            </span>
            <span className={`tag health-${server.health.capabilityStatus}`}>
              Capabilities: {server.health.capabilityStatus.replace("_", " ")}
            </span>
          </>
        ) : (
          <span className="tag health-unknown">MCP readiness: unverified</span>
        )}
      </div>
      <div className="server-card__footer">
        <code>{server.installCommand}</code>
        <button type="button" onClick={() => onOpen(server.id)}>
          View details
        </button>
      </div>
    </article>
  );
}
