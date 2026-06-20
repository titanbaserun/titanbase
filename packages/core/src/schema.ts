import { z } from "zod";
import { TITAN_VERSION } from "./types";

const id = z.string().trim().min(1, "Required");
const optionalText = z.string().trim().min(1).optional();

export const titanColumnSchema = z.object({
  id,
  name: id,
  type: id,
  nativeType: optionalText,
  nullable: z.boolean(),
  primaryKey: z.boolean(),
  unique: z.boolean(),
  default: optionalText,
  description: optionalText,
});

export const titanIndexSchema = z.object({
  id,
  name: id,
  table: id,
  columns: z.array(id).min(1),
  unique: z.boolean(),
  method: optionalText,
  where: optionalText,
  description: optionalText,
});

export const titanTableSchema = z.object({
  id,
  name: id,
  schema: optionalText,
  description: optionalText,
  columns: z.array(titanColumnSchema),
  indexes: z.array(titanIndexSchema),
});

export const titanEnumSchema = z.object({
  id,
  name: id,
  values: z.array(id).min(1),
  description: optionalText,
});

const endpointSchema = z.object({ table: id, columns: z.array(id).min(1) });

export const titanRelationSchema = z.object({
  id,
  name: id,
  from: endpointSchema,
  to: endpointSchema,
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]),
  onDelete: z.enum(["cascade", "restrict", "set-null", "set-default", "no-action"]).optional(),
  onUpdate: z.enum(["cascade", "restrict", "set-null", "set-default", "no-action"]).optional(),
  description: optionalText,
});

export const titanSchemaSchema = z.object({
  titanVersion: z.literal(TITAN_VERSION),
  project: z.object({ id, name: id }),
  dialect: z.enum(["postgres", "mysql", "sqlite", "generic"]),
  tables: z.array(titanTableSchema),
  enums: z.array(titanEnumSchema),
  relations: z.array(titanRelationSchema),
  metadata: z.object({
    editor: z.object({
      tablePositions: z.record(z.object({ x: z.number().finite(), y: z.number().finite() })),
    }),
  }),
});
