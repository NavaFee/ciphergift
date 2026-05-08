"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiftIcon, HistoryIcon, InboxIcon, LockIcon, SendIcon, SparkIcon } from "~~/components/primitives/icons";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SideNavProps {
  /** Optional badge count for the inbox tab (real version derives from useIncomingPackets). */
  inboxBadge?: number;
}

export function SideNav({ inboxBadge }: SideNavProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { id: "home", href: "/dashboard", label: "Dashboard", icon: <SparkIcon size={16} /> },
    { id: "send", href: "/send", label: "Send", icon: <SendIcon size={16} /> },
    {
      id: "inbox",
      href: "/inbox",
      label: "Inbox",
      icon: <InboxIcon size={16} />,
      badge: inboxBadge,
    },
    { id: "sent", href: "/sent", label: "Sent", icon: <GiftIcon size={16} /> },
    { id: "history", href: "/history", label: "History", icon: <HistoryIcon size={16} /> },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <nav
      className="side-nav"
      style={{
        width: 200,
        borderRight: "1px solid var(--line)",
        background: "var(--bg-1)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        className="side-nav-heading"
        style={{
          fontSize: 10,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          padding: "6px 10px 10px",
          fontWeight: 600,
        }}
      >
        Navigate
      </div>
      {items.map(it => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.id}
            href={it.href}
            className="side-nav-link"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 6,
              textDecoration: "none",
              background: active ? "var(--bg-3)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-2)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
            }}
          >
            {it.icon}
            <span className="side-nav-label" style={{ flex: 1 }}>
              {it.label}
            </span>
            {it.badge ? (
              <span
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  padding: "0 5px",
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {it.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="side-nav-spacer" style={{ flex: 1 }} />
      <div
        className="side-nav-footer"
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 10,
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <LockIcon size={11} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--crypt)",
            }}
          >
            FHE Active
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Amounts and recipients are computed under encryption. Nobody sees plaintext but you.
        </div>
      </div>
    </nav>
  );
}
