import type { ResearchVideo } from "./deep-research.types";

/**
 * Fills channel name, publish date and duration for YouTube videos using the
 * YouTube Data API when YOUTUBE_API_KEY is configured (e.g. via Railway
 * variables). Without a key, or on any API failure, the videos keep their
 * basic search-derived fields — enrichment never blocks or fails a research
 * job and the key never reaches the client.
 */
export async function enrichYouTubeVideos(
  videos: ResearchVideo[],
  options: { apiKey?: string; fetchFn?: typeof fetch } = {}
): Promise<ResearchVideo[]> {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return videos;
  const fetchFn = options.fetchFn || fetch;

  const idByVideo = new Map<string, string>();
  for (const video of videos) {
    const id = extractYouTubeId(video.url);
    if (id) idByVideo.set(video.id, id);
  }
  if (idByVideo.size === 0) return videos;

  const ids = [...new Set(idByVideo.values())].slice(0, 50);
  let items: YouTubeApiItem[] = [];
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("key", apiKey);
    const response = await fetchFn(url.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return videos;
    const payload = (await response.json().catch(() => null)) as {
      items?: YouTubeApiItem[];
    } | null;
    items = Array.isArray(payload?.items) ? payload!.items! : [];
  } catch {
    return videos;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  return videos.map((video) => {
    const youtubeId = idByVideo.get(video.id);
    const item = youtubeId ? byId.get(youtubeId) : undefined;
    if (!item) return video;
    return {
      ...video,
      title: item.snippet?.title || video.title,
      channel: item.snippet?.channelTitle || video.channel,
      publishedAt: item.snippet?.publishedAt || video.publishedAt,
      durationLabel: formatIsoDuration(item.contentDetails?.duration) || video.durationLabel,
      description: video.description || (item.snippet?.description || "").slice(0, 200)
    };
  });
}

type YouTubeApiItem = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    description?: string;
  };
  contentDetails?: { duration?: string };
};

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    let id: string | null = null;
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v");
      if (!id && url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2] || null;
    } else if (host === "youtu.be") {
      id = url.pathname.slice(1) || null;
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/u.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** ISO 8601 duration (PT1H2M3S) → "1:02:03" / "2:03" display label. */
export function formatIsoDuration(duration: string | undefined): string | null {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (hours === 0 && minutes === 0 && seconds === 0) return null;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}
