import { TITAN_VERSION, type TitanDialect, type TitanSchema } from "./types";

export interface EmptySchemaOptions {
  id?: string;
  name?: string;
  dialect?: TitanDialect;
}

export function createEmptySchema(options: EmptySchemaOptions = {}): TitanSchema {
  return {
    titanVersion: TITAN_VERSION,
    project: {
      id: options.id ?? "project_new",
      name: options.name ?? "Untitled Schema",
    },
    dialect: options.dialect ?? "postgres",
    tables: [],
    enums: [],
    relations: [],
    metadata: { editor: { tablePositions: {} } },
  };
}
