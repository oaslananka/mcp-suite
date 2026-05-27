import type { CSSProperties, JSX } from "react";

interface JsonEditorProps {
  height?: number;
  label: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  value: string;
}

export function JsonEditor({
  height = 240,
  label,
  onChange,
  readOnly = false,
  value,
}: JsonEditorProps): JSX.Element {
  return (
    <section style={styles.wrapper}>
      <label style={styles.field}>
        <span style={styles.label}>{label}</span>
        <textarea
          aria-label={label}
          readOnly={readOnly}
          spellCheck={false}
          style={{ ...styles.editor, height }}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      </label>
    </section>
  );
}

const styles = {
  wrapper: {
    display: "grid",
    gap: 8,
  },
  field: {
    display: "grid",
    gap: 8,
  },
  editor: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    color: "#0f172a",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.5,
    padding: 12,
    resize: "vertical",
    tabSize: 2,
    whiteSpace: "pre-wrap",
  },
  label: {
    fontWeight: 700,
    color: "#0f172a",
  },
} satisfies Record<string, CSSProperties>;
