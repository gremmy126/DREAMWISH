import assert from "node:assert/strict";
import {
  buildPolarCheckoutPayload,
  getPolarCheckoutRequestConfig
} from "../src/lib/payments/polar.service";

test("buildPolarCheckoutPayload sends only products and checkout redirect URLs", () => {
  withEnv(
    {
      POLAR_PRODUCT_ID: "  123e4567-e89b-12d3-a456-426614174000  ",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100/"
    },
    () => {
      const payload = buildPolarCheckoutPayload({
        customerEmail: "buyer@example.com",
        customerName: "Buyer",
        externalCustomerId: "customer_1"
      });

      assert.deepEqual(Object.keys(payload).sort(), ["products", "return_url", "success_url"]);
      assert.deepEqual(payload, {
        products: ["123e4567-e89b-12d3-a456-426614174000"],
        success_url: "http://127.0.0.1:3100/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "http://127.0.0.1:3100/settings/billing"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig validates required server-side Polar settings", () => {
  withEnv(
    {
      POLAR_ACCESS_TOKEN: "  token-value  ",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000",
      NEXT_PUBLIC_APP_URL: "https://dreamwish.co.kr"
    },
    () => {
      const config = getPolarCheckoutRequestConfig();

      assert.equal(config.accessToken, "token-value");
      assert.deepEqual(config.payload, {
        products: ["123e4567-e89b-12d3-a456-426614174000"],
        success_url: "https://dreamwish.co.kr/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "https://dreamwish.co.kr/settings/billing"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig uses server-only APP_URL before public app url", () => {
  withEnv(
    {
      APP_URL: "https://dreamwish.co.kr/",
      NEXT_PUBLIC_APP_URL: "https://wrong-public.example.com",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      const config = getPolarCheckoutRequestConfig();

      assert.deepEqual(config.payload, {
        products: ["123e4567-e89b-12d3-a456-426614174000"],
        success_url: "https://dreamwish.co.kr/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "https://dreamwish.co.kr/settings/billing"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig rejects protocol-less app urls", () => {
  withEnv(
    {
      APP_URL: "dreamwish.co.kr",
      NEXT_PUBLIC_APP_URL: undefined,
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /APP_URL must be an absolute http or https URL/u
      );
    }
  );
});

test("getPolarCheckoutRequestConfig rejects localhost app urls on Railway", () => {
  withEnv(
    {
      APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_APP_URL: undefined,
      RAILWAY_ENVIRONMENT: "production",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /APP_URL must be a public URL in hosted deployments/u
      );
    }
  );
});

test("getPolarCheckoutRequestConfig rejects product urls before calling Polar", () => {
  withEnv(
    {
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "https://buy.polar.sh/product",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /POLAR_PRODUCT_ID must be a Polar product UUID/u
      );
    }
  );
});

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const original = { ...process.env };
  process.env = {
    ...original
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    process.env = original;
  }
}
