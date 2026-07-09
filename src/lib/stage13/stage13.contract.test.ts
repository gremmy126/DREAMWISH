import {
  POLAR_CHECKOUT_SETTINGS,
  buildPolarCheckoutBrand,
  getPolarApiBaseUrl
} from "@/src/lib/payments/polar.service";

function assertStage13PolarProductionContract() {
  const brand = buildPolarCheckoutBrand();
  if (brand.name !== "DREAMWISH") {
    throw new Error("Polar checkout brand must use DREAMWISH text.");
  }
  if ("logoUrl" in brand) {
    throw new Error("Polar checkout brand must not rely on a logo URL.");
  }

  getPolarApiBaseUrl() satisfies "https://api.polar.sh/v1";
  POLAR_CHECKOUT_SETTINGS.provider satisfies "polar";
}

void assertStage13PolarProductionContract;
