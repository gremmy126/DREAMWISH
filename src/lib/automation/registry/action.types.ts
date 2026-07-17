export type ActionRiskLevel = "read" | "low" | "medium" | "high" | "critical";
export type ActionKind = "trigger" | "read" | "write" | "tool";
export type ActionConfirmationPhrase = "DELETE" | "REFUND" | "DEPLOY" | "SEND" | null;
export type ActionAdditionalAuth =
  | "password"
  | "email_code"
  | "otp"
  | "admin"
  | "approval_link"
  | "slack";

export type ActionScalar = string | number | boolean | null;
export type ActionValue = ActionScalar | ActionValue[] | { [key: string]: ActionValue };

export type ActionFieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "number"
  | "integer"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "timezone"
  | "json"
  | "key_value"
  | "array"
  | "resource"
  | "connection"
  | "file"
  | "mapping";

export type ActionFieldOption = { label: string; value: string };

export type ActionFieldDefinition = {
  id: string;
  label: string;
  type: ActionFieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  example?: ActionValue;
  valueSource?: string;
  mappingExample?: string;
  advanced?: boolean;
  mappable?: boolean;
  secret?: boolean;
  options?: ActionFieldOption[];
  itemType?: Exclude<ActionFieldType, "array">;
  min?: number;
  max?: number;
  visibleWhen?: { field: string; equals: ActionScalar };
};

export type ActionGuideDefinition = {
  summary: string;
  useWhen: string;
  setupSteps: string[];
  inputNotes: string[];
  outputMappings: Array<{ label: string; template: string }>;
};

export type ActionInputSchema = {
  fields: ActionFieldDefinition[];
};

export type ActionOutputField = {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  nullable?: boolean;
};

export type ActionOutputSchema = {
  fields: ActionOutputField[];
};

export type ValidationRule =
  | { kind: "required_any"; fields: string[]; message: string }
  | { kind: "different"; left: string; right: string; message: string }
  | { kind: "less_than_or_equal"; left: string; right: string; message: string };

export type RiskEscalationRule = {
  field: string;
  operator: "equals" | "greater_than" | "contains";
  value: ActionScalar;
  riskLevel: Exclude<ActionRiskLevel, "read">;
  reason: string;
};

export type PreviewDefinition = {
  title: string;
  targetFields: string[];
  beforeFields?: string[];
  afterFields?: string[];
  countField?: string;
  amountField?: string;
  reversible: boolean | "dynamic";
  failureImpact: string;
};

export type ActionDefinition = {
  id: string;
  version: number;
  appId: string;
  name: string;
  description: string;
  guide: ActionGuideDefinition;
  kind: ActionKind;
  inputSchema: ActionInputSchema;
  outputSchema: ActionOutputSchema;
  outputSchemaVersion: number;
  validation: ValidationRule[];
  defaultValues: Record<string, ActionValue>;
  requiredScopes: string[];
  riskLevel: ActionRiskLevel;
  riskRules: RiskEscalationRule[];
  previewDefinition: PreviewDefinition;
  adapterKey: string;
  adapterVersion: number;
  confirmationPhrase: ActionConfirmationPhrase;
  additionalAuth: ActionAdditionalAuth[];
};

