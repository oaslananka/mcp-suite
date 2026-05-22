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
    width: 272,
    minHeight: "100vh",
    padding: 28,
    background: "linear-gradient(180deg, #0b1732 0%, #101c3f 55%, #11213d 100%)",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 28,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "inset -1px 0 0 rgba(255,255,255,0.06)",
  },
  brand: {
    fontFamily: '"Fraunces", Georgia, serif',
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: "0.01em",
  },
  tagline: {
    margin: "10px 0 0",
    fontSize: 14,
    lineHeight: 1.65,
    color: "rgba(226, 232, 240, 0.86)",
  },
  nav: {
    display: "grid",
    gap: 10,
  },
  link: {
    padding: "13px 15px",
    borderRadius: 14,
    color: "#d6e1f2",
    textDecoration: "none",
    fontWeight: 600,
    border: "1px solid transparent",
    transition: "all 160ms ease",
  },
  linkActive: {
    background: "linear-gradient(135deg, rgba(14, 165, 233, 0.34), rgba(59, 130, 246, 0.2))",
    color: "#ecfeff",
    border: "1px solid rgba(125, 211, 252, 0.6)",
    boxShadow: "0 8px 22px rgba(14, 165, 233, 0.24)",
  },
} satisfies {
  sidebar: CSSProperties;
  brand: CSSProperties;
  tagline: CSSProperties;
  nav: CSSProperties;
  link: CSSProperties;
  linkActive: CSSProperties;
};
