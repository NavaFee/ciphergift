import type { ButtonHTMLAttributes, ReactNode } from "react";

export type BtnKind = "primary" | "ghost" | "dark" | "fhe";
export type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Btn({ children, kind = "primary", size, block, icon, iconRight, className, ...rest }: BtnProps) {
  const cls = ["cr-btn", `cr-btn-${kind}`];
  if (size && size !== "md") cls.push(`cr-btn-${size}`);
  if (block) cls.push("cr-btn-block");
  if (className) cls.push(className);
  return (
    <button className={cls.join(" ")} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
