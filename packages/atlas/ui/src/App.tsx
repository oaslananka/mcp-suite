import { useEffect, useState } from "react";
import { SearchBar } from "./components/SearchBar.js";
import { ServerCard, type AtlasServer } from "./components/ServerCard.js";
import { TagFilter } from "./components/TagFilter.js";

interface SearchResponse {
  items: AtlasServer[];
  total: number;
}

function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function HomePage(): JSX.Element {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [servers, setServers] = useState<AtlasServer[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [trending, setTrending] = useState<AtlasServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchJson<{ tags: string[] }>("/api/tags").then((data) => setTags(data.tags));
    void fetchJson<{ items: AtlasServer[] }>("/api/trending").then((data) => setTrending(data.items));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) {
      params.set("q", search);
    }
    if (activeTag) {
      params.set("tag", activeTag);
    }
    if (verifiedOnly) {
      params.set("verified", "true");
    }

    setLoading(true);
    void fetchJson<SearchResponse>(`/api/servers?${params.toString()}`)
      .then((data) => setServers(data.items))
      .finally(() => setLoading(false));
  }, [activeTag, search, verifiedOnly]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Atlas registry</p>
          <h1>Find MCP servers that are easy to trust and quick to install.</h1>
          <p className="lede">
            Atlas brings discovery, lightweight quality scoring, and install guidance into one focused
            registry experience for the MCP ecosystem.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{servers.length}</strong>
            <span>matching servers</span>
          </div>
          <div>
            <strong>{tags.length}</strong>
            <span>tag filters</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <SearchBar value={search} onChange={setSearch} />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(event) => setVerifiedOnly(event.target.checked)}
            />
            Verified only
          </label>
        </div>
        <TagFilter tags={tags} activeTag={activeTag} onSelect={setActiveTag} />
      </section>

      <section className="section-header">
        <div>
          <p className="eyebrow">Trending</p>
          <h2>Popular servers right now</h2>
        </div>
        <button type="button" className="ghost-button" onClick={() => navigate("/submit")}>
          Submit a server
        </button>
      </section>

      <section className="trending-grid">
        {trending.slice(0, 3).map((server) => (
          <ServerCard key={server.id} server={server} onOpen={(id) => navigate(`/servers/${id}`)} />
        ))}
      </section>

      <section className="section-header compact">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2>{loading ? "Loading servers..." : "Browse the full registry"}</h2>
        </div>
      </section>

      <section className="catalog-grid">
        {servers.map((server) => (
          <ServerCard key={server.id} server={server} onOpen={(id) => navigate(`/servers/${id}`)} />
        ))}
        {!loading && servers.length === 0 ? (
          <div className="empty-state">
            <h3>No matches yet</h3>
            <p>Try removing a filter or search for a broader capability like "database" or "browser".</p>
          </div>
        ) : null}
      </section>
    </>
  );
}

function ServerDetailPage({ serverId }: { serverId: string }): JSX.Element {
  const [server, setServer] = useState<AtlasServer | null>(null);

  useEffect(() => {
    void fetchJson<AtlasServer>(`/api/servers/${serverId}`).then((data) => setServer(data));
  }, [serverId]);

  if (!server) {
    return <section className="detail-shell">Loading server details...</section>;
  }

  return (
    <section className="detail-shell">
      <button type="button" className="ghost-button" onClick={() => navigate("/")}>
        Back to catalog
      </button>
      <div className="detail-card">
        <div className="detail-card__header">
          <div>
            <p className="eyebrow">{server.author}</p>
            <h1>{server.name}</h1>
          </div>
          <div className="score-pill large">{server.qualityScore ?? 0}/100</div>
        </div>
        <p className="lede">{server.description}</p>
        <div className="detail-grid">
          <div>
            <h3>Install command</h3>
            <code>{server.installCommand}</code>
          </div>
          <div>
            <h3>Package</h3>
            <code>{server.packageName}</code>
          </div>
          <div>
            <h3>Downloads</h3>
            <p>{server.downloads.toLocaleString()}</p>
          </div>
          <div>
            <h3>Verification</h3>
            <p>{server.verified ? "Verified registry entry" : "Community submission"}</p>
          </div>
        </div>
        <div className="tag-stack">
          {server.tags.map((tag) => (
            <span key={tag} className="tag muted">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function SubmitPage(): JSX.Element {
  const [formState, setFormState] = useState({
    name: "",
    packageName: "",
    description: "",
    homepage: "",
    tags: "",
  });
  const [status, setStatus] = useState("");

  async function submitForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const response = await fetchJson<AtlasServer>("/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...formState,
        tags: formState.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    setStatus(`Submission created for ${response.name}.`);
  }

  return (
    <section className="detail-shell">
      <button type="button" className="ghost-button" onClick={() => navigate("/")}>
        Back to catalog
      </button>
      <form className="detail-card form-card" onSubmit={(event) => void submitForm(event)}>
        <div>
          <p className="eyebrow">Community submissions</p>
          <h1>Submit a new MCP server</h1>
        </div>
        <label>
          Name
          <input
            value={formState.name}
            onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </label>
        <label>
          npm package
          <input
            value={formState.packageName}
            onChange={(event) => setFormState((current) => ({ ...current, packageName: event.target.value }))}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={formState.description}
            onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
            rows={4}
            required
          />
        </label>
        <label>
          Homepage
          <input
            value={formState.homepage}
            onChange={(event) => setFormState((current) => ({ ...current, homepage: event.target.value }))}
            placeholder="https://github.com/owner/repo"
          />
        </label>
        <label>
          Tags
          <input
            value={formState.tags}
            onChange={(event) => setFormState((current) => ({ ...current, tags: event.target.value }))}
            placeholder="browser, automation, testing"
          />
        </label>
        <button type="submit">Create submission</button>
        {status ? <p className="status-note">{status}</p> : null}
      </form>
    </section>
  );
}

export function App(): JSX.Element {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = (): void => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (currentPath.startsWith("/servers/")) {
    return <ServerDetailPage serverId={currentPath.replace("/servers/", "")} />;
  }

  if (currentPath === "/submit") {
    return <SubmitPage />;
  }

  return <HomePage />;
}
