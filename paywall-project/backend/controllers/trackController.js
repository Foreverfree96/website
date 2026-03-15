import fetch from "node-fetch";
import { PageView, LocationStat, SiteStat } from "../models/analyticsModel.js";

// Paths that should never be counted (health checks, API calls, etc.)
const IGNORED_PATHS = ["/", "/favicon.ico"];

/**
 * POST /api/track/pageview
 *
 * Called from the frontend router on every route change.
 * Increments the view counter for the given path and, fire-and-forget,
 * looks up the visitor's country from their IP using ip-api.com.
 *
 * Body: { path: string }
 * Always responds 204 — the client never waits on this.
 */
export const trackPageView = async (req, res) => {
  res.sendStatus(204); // respond immediately — don't block the user

  try {
    const path = (req.body?.path || "").split("?")[0].trim();
    if (!path || IGNORED_PATHS.includes(path)) return;

    // Upsert page view count
    await PageView.findOneAndUpdate(
      { path },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    // Geo lookup — skip for local IPs
    const ip = (req.headers["x-forwarded-for"] || req.ip || "")
      .split(",")[0]
      .trim();
    const isLocal = !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.");
    if (isLocal) return;

    const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,status`, {
      signal: AbortSignal.timeout(3000),
    }).then(r => r.json()).catch(() => null);

    if (geo?.status === "success" && geo.country) {
      await LocationStat.findOneAndUpdate(
        { country: geo.country },
        { $inc: { count: 1 } },
        { upsert: true }
      );
    }
  } catch {
    // fire-and-forget — errors are silently ignored
  }
};

/**
 * POST /api/track/download
 *
 * Increments the global download counter.
 * Called by the frontend whenever a user downloads a project/file.
 * Always responds 204.
 */
export const trackDownload = async (req, res) => {
  res.sendStatus(204);
  try {
    await SiteStat.findOneAndUpdate(
      { key: "downloads" },
      { $inc: { count: 1 } },
      { upsert: true }
    );
  } catch {
    // ignore
  }
};
