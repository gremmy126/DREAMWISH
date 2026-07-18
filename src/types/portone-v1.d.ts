export {};

declare global {
  interface Window {
    IMP?: {
      init(code: string): void;
      request_pay(
        parameters: {
          channelKey: string; pay_method: "card"; merchant_uid: string; name: string;
          amount: number; customer_uid: string; buyer_email?: string; buyer_name?: string;
          buyer_tel?: string; m_redirect_url?: string;
        },
        callback: (response: { success?: boolean; imp_uid?: string; merchant_uid?: string; error_msg?: string }) => void
      ): void;
    };
  }
}

