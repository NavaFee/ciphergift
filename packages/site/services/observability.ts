type EventProps = Record<string, string | number | boolean | undefined>;

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function shortAddress(addr?: string) {
  if (!addr) return undefined;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function sendJson(url: string, payload: unknown) {
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

function sentryEnvelopeUrl(dsn: string): string | undefined {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");
    if (!projectId) return undefined;
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  } catch {
    return undefined;
  }
}

export function trackEvent(name: string, props: EventProps = {}) {
  if (posthogKey) {
    sendJson(`${posthogHost.replace(/\/+$/, "")}/capture/`, {
      api_key: posthogKey,
      event: name,
      properties: {
        ...props,
        wallet: shortAddress(String(props.wallet || "")) || undefined,
        app: "ciphergift",
      },
    });
  }
}

export function captureError(err: unknown, context: EventProps = {}) {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
  trackEvent("error", { ...context, message: message.slice(0, 180) });

  if (!sentryDsn) return;
  const url = sentryEnvelopeUrl(sentryDsn);
  if (!url) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const envelope = [
    JSON.stringify({ event_id: eventId, dsn: sentryDsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: eventId,
      level: "error",
      platform: "javascript",
      timestamp: Date.now() / 1000,
      message,
      extra: context,
    }),
  ].join("\n");

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([envelope], { type: "application/x-sentry-envelope" }));
    return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body: envelope,
    keepalive: true,
  }).catch(() => undefined);
}
