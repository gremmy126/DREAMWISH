export type EncryptedField = {
  encryptedValue: string;
  algorithm: "local-dev-base64";
  createdAt: string;
};

export function encryptTokenField(value: string): EncryptedField {
  return {
    encryptedValue: Buffer.from(value, "utf8").toString("base64"),
    algorithm: "local-dev-base64",
    createdAt: new Date().toISOString()
  };
}

export function decryptTokenField(field: EncryptedField): string {
  return Buffer.from(field.encryptedValue, "base64").toString("utf8");
}
