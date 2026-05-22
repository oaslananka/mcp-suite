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
