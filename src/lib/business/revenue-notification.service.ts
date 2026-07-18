import { enqueueMobilePushNotification } from "../automation/queue/notification-outbox";
import type { RevenueCandidate } from "./revenue.types";

export async function enqueueRevenueReviewNotification(candidate: RevenueCandidate) {
  return enqueueMobilePushNotification({
    ownerId: candidate.ownerId,
    subjectId: candidate.id,
    eventType: "revenue.review_required",
    safePayload: {
      type: "revenue.review_required",
      candidateId: candidate.id,
      route: `/business/revenue?candidate=${encodeURIComponent(candidate.id)}`
    }
  });
}
