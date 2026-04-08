import type { CSSProperties, JSX } from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Connect" },
  { to: "/tools", label: "Tools" },
  { to: "/resources", label: "Resources" },
  { to: "/prompts", label: "Prompts" },
  { to: "/history", label: "History" },
];

export function Sidebar(): JSX.Element {
  return (
    <aside style={styles.sidebar}>
      <div>
        <div style={styles.brand}>MCP Lab</div>
        <p style={styles.tagline}>Connect, inspect, replay, and export your MCP traffic.</p>
      </div>

      <nav style={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              ...styles.link,
              ...(isActive ? styles.linkActive : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 240,
    minHeight: "100vh",
    padding: 24,
    background: "linear-gradient(180deg, #101827 0%, #172033 100%)",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    borderRight: "1px solid rgba(255,255,255,0.08)",
  },
  brand: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  tagline: {
    margin: "8px 0 0",
    fontSize: 13,
    lineHeight: 1.6,
    color: "rgba(248,250,252,0.72)",
  },
  nav: {
    display: "grid",
    gap: 8,
  },
  link: {
    padding: "12px 14px",
    borderRadius: 12,
    color: "#cbd5e1",
    textDecoration: "none",
    fontWeight: 600,
  },
  linkActive: {
    background: "rgba(56, 189, 248, 0.16)",
    color: "#e0f2fe",
  },
} satisfies {
  sidebar: CSSProperties;
  brand: CSSProperties;
  tagline: CSSProperties;
  nav: CSSProperties;
  link: CSSProperties;
  linkActive: CSSProperties;
};
