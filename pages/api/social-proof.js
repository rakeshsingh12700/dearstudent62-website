function formatFollowersCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M+`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k+`;
  }
  return `${Math.round(count)}+`;
}

function parseFollowersLabel(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\+/g, "");
  if (!raw) return 0;
  const multiplier = raw.endsWith("m") ? 1_000_000 : raw.endsWith("k") ? 1_000 : 1;
  const numeric = Number.parseFloat(raw.replace(/[km]$/i, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric * multiplier;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fallback =
    String(process.env.NEXT_PUBLIC_INSTAGRAM_FOLLOWERS_LABEL || "").trim() || "240k+";
  const igUserId = String(process.env.INSTAGRAM_USER_ID || "").trim();
  const igToken = String(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN || "").trim();
  const graphVersion = String(process.env.INSTAGRAM_GRAPH_VERSION || "").trim() || "v21.0";

  if (!igUserId || !igToken) {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({ instagramFollowersLabel: fallback, source: "fallback" });
  }

  try {
    const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(
      igUserId
    )}?fields=followers_count&access_token=${encodeURIComponent(igToken)}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Instagram API request failed (${response.status}): ${text}`);
    }
    const payload = await response.json();
    const liveCount = Number(payload?.followers_count || 0);
    const fallbackCount = parseFollowersLabel(fallback);
    const label =
      Number.isFinite(liveCount) && liveCount > fallbackCount
        ? formatFollowersCount(liveCount)
        : fallback;

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=21600");
    return res.status(200).json({ instagramFollowersLabel: label, source: "instagram_graph" });
  } catch (error) {
    console.error("Social proof fetch failed:", error);
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=1200");
    return res.status(200).json({ instagramFollowersLabel: fallback, source: "fallback_error" });
  }
}
