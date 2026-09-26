import type { UnitTree, UnitTreeNode } from '../../services/api';

// Pure helpers behind the Troop Progression tree: indexing, filtering and a left-to-right tidy-tree layout.
// The server sends the tree as nodes + parent->child edges (see getUnitTreeView in routes/kingdoms.js);
// nothing here knows about specific units, so custom troops the DM adds simply appear as more nodes.

export const NODE_W = 204;
export const NODE_H = 104;
const COL_GAP = 60;
const ROW_GAP = 16;

export const ROOT_ID = 'Militia';

export type TroopFilter = 'all' | 'available' | 'custom';

export interface TreeIndex {
  byId: Map<string, UnitTreeNode>;
  children: Map<string, string[]>;
  parent: Map<string, string>;
}

export const indexTree = (tree: UnitTree | undefined): TreeIndex => {
  const byId = new Map<string, UnitTreeNode>();
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const node of tree?.nodes || []) byId.set(node.id, node);
  for (const edge of tree?.edges || []) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from)!.push(edge.to);
    parent.set(edge.to, edge.from);
  }
  return { byId, children, parent };
};

// Ids from a node up to the root, node first. Guarded against a malformed (cyclic) tree.
export const pathToRoot = (index: TreeIndex, id: string): string[] => {
  const path: string[] = [];
  let current: string | undefined = id;
  while (current && !path.includes(current)) {
    path.push(current);
    current = index.parent.get(current);
  }
  return path;
};

export const descendantsOf = (index: TreeIndex, id: string): Set<string> => {
  const out = new Set<string>();
  const stack = [...(index.children.get(id) || [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(index.children.get(next) || []));
  }
  return out;
};

// Which nodes stay on screen for a filter + search. Anything that matches keeps its ancestors so the
// path back to Militia is never broken.
export const visibleIds = (index: TreeIndex, filter: TroopFilter, query: string): Set<string> => {
  const q = query.trim().toLowerCase();
  const keep = new Set<string>();
  for (const node of index.byId.values()) {
    const matchesFilter = filter === 'all' || (filter === 'available' && node.unlocked) || (filter === 'custom' && node.is_custom);
    const matchesQuery = !q || node.unit_type.toLowerCase().includes(q) || node.line_key.toLowerCase().includes(q);
    if (matchesFilter && matchesQuery) for (const id of pathToRoot(index, node.id)) keep.add(id);
  }
  if (keep.size > 0) keep.add(ROOT_ID);
  return keep;
};

export interface Placed {
  id: string;
  x: number;
  y: number;
  depth: number;
}

// Classic tidy tree, laid out left to right: leaves take consecutive rows, every parent sits centred
// on its children, and x grows with depth. Only nodes in `keep` are placed.
export const layoutTree = (index: TreeIndex, keep: Set<string>): Placed[] => {
  if (!index.byId.has(ROOT_ID) || !keep.has(ROOT_ID)) return [];
  const placed: Placed[] = [];
  let nextRow = 0;

  const place = (id: string, depth: number, seen: Set<string>): number => {
    seen.add(id);
    const kids = (index.children.get(id) || []).filter((c) => keep.has(c) && !seen.has(c));
    let row: number;
    if (kids.length === 0) {
      row = nextRow;
      nextRow += 1;
    } else {
      const rows = kids.map((c) => place(c, depth + 1, seen));
      row = (rows[0] + rows[rows.length - 1]) / 2;
    }
    placed.push({ id, x: depth * (NODE_W + COL_GAP), y: row * (NODE_H + ROW_GAP), depth });
    return row;
  };

  place(ROOT_ID, 0, new Set());
  return placed;
};

export const effectiveTrainingDays = (baseDays: number, speedPct: number): number =>
  Math.max(1, Math.ceil(baseDays * (1 - speedPct / 100)));
