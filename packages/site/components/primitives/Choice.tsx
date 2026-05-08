import type { ReactNode } from "react";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface ChoiceProps<T extends string = string> {
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  columns?: number;
}

export function Choice<T extends string = string>({ value, options, onChange, columns = 2 }: ChoiceProps<T>) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              cursor: "pointer",
              padding: "14px 12px",
              borderRadius: "var(--r-2)",
              background: active ? "rgba(255,210,0,0.08)" : "var(--bg-2)",
              border: active ? "1.5px solid var(--accent)" : "1px solid var(--line-2)",
              color: "var(--ink)",
              textAlign: "left",
              fontFamily: "var(--font-sans)",
              transition: "border-color .15s, background .15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {o.icon}
              <span style={{ fontWeight: 600, fontSize: 13 }}>{o.label}</span>
            </div>
            {o.hint && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}
