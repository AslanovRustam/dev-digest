/* DocumentTree — the clone's project documents as collapsible folders. A file
   row selects the document; a folder row toggles it and becomes the folder New
   file / Upload write into. Rows are buttons, so the tree is keyboard-operable. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { TreeNode } from "../../helpers";
import { s } from "./styles";

interface TreeProps {
  selectedPath: string | null;
  selectedFolder: string | null;
  onSelectFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
}

export function DocumentTree({ nodes, label, ...props }: TreeProps & { nodes: TreeNode[]; label: string }) {
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());
  const onToggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    props.onSelectFolder(path);
  };
  return <TreeLevel nodes={nodes} depth={0} label={label} collapsed={collapsed} onToggle={onToggle} {...props} />;
}

function TreeLevel({
  nodes,
  depth,
  label,
  collapsed,
  onToggle,
  ...props
}: TreeProps & {
  nodes: TreeNode[];
  depth: number;
  label?: string;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
}) {
  const { selectedPath, selectedFolder, onSelectFile } = props;
  return (
    <ul style={s.list} role={depth === 0 ? "tree" : "group"} aria-label={label}>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const open = !collapsed.has(node.path);
          const selected = selectedFolder === node.path;
          return (
            <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={selected}>
              <button type="button" style={s.row({ depth, selected, folder: true })} onClick={() => onToggle(node.path)}>
                {open ? <Icon.ChevronDown size={12} /> : <Icon.ChevronRight size={12} />}
                <Icon.Folder size={14} style={s.icon(false)} />
                <span style={s.name}>{node.name}</span>
              </button>
              {open && (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  {...props}
                />
              )}
            </li>
          );
        }
        const selected = selectedPath === node.path;
        return (
          <li key={node.path} role="treeitem" aria-selected={selected}>
            <button
              type="button"
              className="mono"
              aria-current={selected ? "true" : undefined}
              style={s.row({ depth, selected, folder: false })}
              onClick={() => onSelectFile(node.path)}
              title={node.path}
            >
              <Icon.FileText size={14} style={s.icon(selected)} />
              <span style={s.name}>{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
