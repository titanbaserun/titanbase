import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Key, Table } from "@phosphor-icons/react";
import { Badge } from "@titanbase/ui";
import type { TitanTable } from "@titanbase/core";

export type TableNode = Node<{ table: TitanTable; onSelectColumn: (tableId: string, columnId: string) => void; selectedColumnId?: string }, "tableNode">;

export function TableNodeView({ data, selected }: NodeProps<TableNode>) {
  return (
    <div className={`schema-node ${selected ? "schema-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="schema-node__header">
        <Table size={18} weight="duotone" />
        <strong>{data.table.name}</strong>
        <span>{data.table.columns.length}</span>
      </div>
      <div className="schema-node__columns">
        {data.table.columns.map((column) => (
          <button className={`nodrag schema-node__column ${data.selectedColumnId === column.id ? "schema-node__column--selected" : ""}`} key={column.id} onClick={(event) => { event.stopPropagation(); data.onSelectColumn(data.table.id, column.id); }}>
            <span className="schema-node__name">{column.primaryKey ? <Key size={14} weight="fill" /> : null}{column.name}</span>
            <span className="schema-node__type">{column.nativeType ?? column.type}</span>
            <span className="schema-node__flags">
              {column.primaryKey ? <Badge tone="blue">PK</Badge> : null}
              {column.unique && !column.primaryKey ? <Badge tone="green">UQ</Badge> : null}
              {column.nullable ? <span className="nullable-dot" title="Nullable" /> : null}
            </span>
          </button>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
