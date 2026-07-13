import { renderSocialImage, SOCIAL_IMAGE_SIZE } from "@/src/lib/site/social-image";

export const alt = "DREAMWISH 개인두뇌 AI";
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderSocialImage();
}
