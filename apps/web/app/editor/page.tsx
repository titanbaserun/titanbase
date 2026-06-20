import { SchemaEditor } from "@titanbase/editor";
import type { TitanSchema } from "@titanbase/core";
import blogSchema from "../../../../examples/blog/blog.titan.json";

export default function EditorPage() {
  return <SchemaEditor initialSchema={blogSchema as TitanSchema} />;
}
