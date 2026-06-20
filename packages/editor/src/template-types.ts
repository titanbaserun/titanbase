import type { TitanSchema } from "@titanbase/core";

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  schema: TitanSchema;
}
