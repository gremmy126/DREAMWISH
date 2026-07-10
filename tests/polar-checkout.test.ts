import assert from "node:assert/strict";
import {
  buildPolarCheckoutPayload,
  getPolarCheckoutRequestConfig
} from "../src/lib/payments/polar.service";

test("buildPolarCheckoutPayload sends only products and checkout redirect URLs", () => {
  withEnv(
    {
      POLAR_PRODUCT_ID: "  123e4567-e89b-12d3-a456-426614174000  ",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100/"
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
        success_url: "http://localhost:3100/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "http://localhost:3100/pricing?payment=cancelled"
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
        return_url: "https://dreamwish.co.kr/pricing?payment=cancelled"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig uses NEXT_PUBLIC_APP_URL before legacy app url", () => {
  withEnv(
    {
      APP_URL: "https://wrong-server.example.com/",
      NEXT_PUBLIC_APP_URL: "https://dreamwish.co.kr",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      const config = getPolarCheckoutRequestConfig();

      assert.deepEqual(config.payload, {
        products: ["123e4567-e89b-12d3-a456-426614174000"],
        success_url: "https://dreamwish.co.kr/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "https://dreamwish.co.kr/pricing?payment=cancelled"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig honors explicit Polar success and cancel urls", () => {
  withEnv(
    {
      NEXT_PUBLIC_APP_URL: "https://dreamwish.co.kr",
      POLAR_SUCCESS_URL: "https://dreamwish.co.kr/payment/success",
      POLAR_CANCEL_URL: "https://dreamwish.co.kr/pricing?payment=cancelled",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      const config = getPolarCheckoutRequestConfig();

      assert.deepEqual(config.payload, {
        products: ["123e4567-e89b-12d3-a456-426614174000"],
        success_url: "https://dreamwish.co.kr/payment/success?checkout_id={CHECKOUT_ID}",
        return_url: "https://dreamwish.co.kr/pricing?payment=cancelled"
      });
    }
  );
});

test("getPolarCheckoutRequestConfig rejects protocol-less app urls", () => {
  withEnv(
    {
      APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: "dreamwish.co.kr",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /Invalid NEXT_PUBLIC_APP_URL/u
      );
    }
  );
});

test("getPolarCheckoutRequestConfig rejects localhost app urls on Railway", () => {
  withEnv(
    {
      APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      RAILWAY_ENVIRONMENT: "production",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /NEXT_PUBLIC_APP_URL cannot use localhost in production/u
      );
    }
  );
});

test("getPolarCheckoutRequestConfig rejects quoted and nested checkout urls", () => {
  withEnv(
    {
      NEXT_PUBLIC_APP_URL: "https://dreamwish.co.kr",
      POLAR_SUCCESS_URL: "\"https://dreamwish.co.kr/payment/success\"",
      POLAR_CANCEL_URL: "https://dreamwish.co.kr/https://dreamwish.co.kr/pricing",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /Invalid POLAR_SUCCESS_URL/u
      );
    }
  );
});

test("getPolarCheckoutRequestConfig rejects www production domain drift", () => {
  withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://www.dreamwish.co.kr",
      POLAR_ACCESS_TOKEN: "token-value",
      POLAR_PRODUCT_ID: "123e4567-e89b-12d3-a456-426614174000"
    },
    () => {
      assert.throws(
        () => getPolarCheckoutRequestConfig(),
        /NEXT_PUBLIC_APP_URL must use dreamwish.co.kr/u
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
