import { createPublicKey, verify } from "node:crypto";
import { DeviceProtocolError } from "./device-contract";

export function validatePublicKeySpki(publicKeySpki: string) {
  try {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(publicKeySpki)) {
      throw new Error("invalid encoding");
    }
    const der = Buffer.from(publicKeySpki, "base64");
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("invalid curve");
    }
    const canonical = key.export({ format: "der", type: "spki" }) as Buffer;
    if (!canonical.equals(der)) throw new Error("noncanonical key");
    return canonical.toString("base64");
  } catch {
    throw new DeviceProtocolError("DEVICE_PUBLIC_KEY_INVALID");
  }
}

export function verifyDeviceSignature(input: {
  publicKeySpki: string;
  canonicalEnvelope: string;
  signature: string;
}) {
  try {
    const key = createPublicKey({
      key: Buffer.from(validatePublicKeySpki(input.publicKeySpki), "base64"),
      format: "der",
      type: "spki"
    });
    const signature = Buffer.from(input.signature, "base64url");
    const options = signature.length === 64
      ? { key, dsaEncoding: "ieee-p1363" as const }
      : { key, dsaEncoding: "der" as const };
    if (!verify("sha256", Buffer.from(input.canonicalEnvelope, "utf8"), options, signature)) {
      throw new Error("invalid");
    }
  } catch (error) {
    if (error instanceof DeviceProtocolError && error.code === "DEVICE_PUBLIC_KEY_INVALID") throw error;
    throw new DeviceProtocolError("DEVICE_SIGNATURE_INVALID");
  }
}
