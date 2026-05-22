import type { CSSProperties, JSX } from "react";
import { Editor } from "@monaco-editor/react";

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
      <div style={styles.label}>{label}</div>
      <Editor
        defaultLanguage="json"
        height={height}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: "on",
          readOnly,
          scrollBeyondLastLine: false,
        }}
        theme="vs-light"
        value={value}
        onChange={(nextValue: string | undefined) => onChange?.(nextValue ?? "")}
      />
    </section>
  );
}

const styles = {
  wrapper: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontWeight: 700,
    color: "#0f172a",
  },
} satisfies Record<string, CSSProperties>;
