export type SocialProvider = "kakao" | "naver";

export type SocialProfile = {
  subject: string;
  email: string;
  name: string | null;
  emailVerified: true;
};

export type SocialToken = {
  accessToken: string;
  tokenType: string;
};

