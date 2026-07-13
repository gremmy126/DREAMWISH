import { permanentRedirect } from "next/navigation";

export default function PaymentSuccessPage() {
  permanentRedirect("/");
}
