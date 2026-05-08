interface SwitchProps {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Switch({ on, onChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "var(--accent)" : "var(--bg-3)",
        position: "relative",
        transition: "background .15s",
        padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? "#0a0a0a" : "var(--ink-2)",
          transition: "left .15s",
        }}
      />
    </button>
  );
}
