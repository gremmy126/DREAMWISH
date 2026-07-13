import type { SVGProps } from "react";

export function BrainLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M30 14.5a10 10 0 0 0-18 6A9.5 9.5 0 0 0 10 39a10 10 0 0 0 14 9.2V54l8-6 8 6v-5.8A10 10 0 0 0 54 39a9.5 9.5 0 0 0-2-18.5 10 10 0 0 0-18-6"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 13v35M21 19c4 0 7 3 7 7M43 19c-4 0-7 3-7 7M17 33c5-1 9 2 10 7M47 33c-5-1-9 2-10 7"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="33" r="2.5" fill="currentColor" />
      <circle cx="47" cy="33" r="2.5" fill="currentColor" />
      <circle cx="32" cy="13" r="2.5" fill="currentColor" />
    </svg>
  );
}
