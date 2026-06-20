export const TITAN_VERSION = "1.0" as const;

export type TitanDialect = "postgres" | "mysql" | "sqlite" | "generic";
export type RelationCardinality = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
export type ReferentialAction = "cascade" | "restrict" | "set-null" | "set-default" | "no-action";

export interface TitanColumn {
  id: string;
  name: string;
  type: string;
  nativeType?: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: string;
  description?: string;
}

export interface TitanIndex {
  id: string;
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  method?: string;
  where?: string;
  description?: string;
}

export interface TitanTable {
  id: string;
  name: string;
  schema?: string;
  description?: string;
  columns: TitanColumn[];
  indexes: TitanIndex[];
}

export interface TitanEnum {
  id: string;
  name: string;
  values: string[];
  description?: string;
}

export interface TitanRelationEndpoint {
  table: string;
  columns: string[];
}

export interface TitanRelation {
  id: string;
  name: string;
  from: TitanRelationEndpoint;
  to: TitanRelationEndpoint;
  cardinality: RelationCardinality;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  description?: string;
}

export interface TitanPosition {
  x: number;
  y: number;
}

export interface TitanSchema {
  titanVersion: typeof TITAN_VERSION;
  project: {
    id: string;
    name: string;
    description?: string;
  };
  dialect: TitanDialect;
  tables: TitanTable[];
  enums: TitanEnum[];
  relations: TitanRelation[];
  metadata: {
    editor: {
      tablePositions: Record<string, TitanPosition>;
    };
  };
}

export type DiagnosticSeverity = "error" | "warning";

export interface TitanDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string;
  entityId?: string;
}
