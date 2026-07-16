import { randomUUID } from "node:crypto";
import type { ResearchVideo } from "./deep-research.types";

/**
 * Classifies a search result URL as a video (YouTube/Vimeo and common
 * institutional video pages). Returns null for ordinary pages. Only validated
 * IDs produce thumbnails; nothing is fabricated.
 */
export function classifyResearchVideo(
  url: string,
  title: string,
  snippet: string,
  relatedQuery: string
): ResearchVideo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");

  let videoId: string | null = null;
  let thumbnailUrl: string | null = null;

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    videoId = parsed.searchParams.get("v");
    if (!videoId && parsed.pathname.startsWith("/shorts/")) {
      videoId = parsed.pathname.split("/")[2] || null;
    }
  } else if (host === "youtu.be") {
    videoId = parsed.pathname.slice(1) || null;
  } else if (host === "vimeo.com") {
    const match = parsed.pathname.match(/^\/(\d{6,12})$/u);
    videoId = match?.[1] || null;
  } else {
    return null;
  }

  if (videoId && /^[A-Za-z0-9_-]{6,20}$/u.test(videoId)) {
    if (host !== "vimeo.com") {
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  } else {
    return null;
  }

  return {
    id: randomUUID(),
    url,
    title: title || "관련 영상",
    channel: null,
    description: snippet || "",
    thumbnailUrl,
    publishedAt: null,
    durationLabel: null,
    relatedQuery
  };
}
