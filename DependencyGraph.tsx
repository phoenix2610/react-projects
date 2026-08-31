// Dependency Graph Explorer
//
// A force-directed layout (repulsion between every pair of nodes, spring
// attraction along edges, a weak pull toward center) run for a fixed
// number of steps rather than animated indefinitely — deterministic given
// the same starting positions, which is what makes "recompute layout"
// reproducible instead of drifting to a different result every time.
// Cycle detection walks the DIRECTED graph with a recursion-stack DFS
// (a node reachable from itself while still on the stack is a cycle);
// path highlighting treats the graph as undirected and does a plain BFS,
// since "how are these two packages related" is usually asked regardless
// of which one depends on which.
//
// Usage:
//   <DependencyGraph nodes={nodes} edges={edges} />
//
// Default export seeds a small package graph with a deliberate cycle
// (icons -> color-utils -> icons) so cycle detection has something to find.

import { useMemo, useState } from 'react';

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

const WIDTH = 480;
const HEIGHT = 300;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

function initialPositions(nodes: GraphNode[]): PositionedNode[] {
  const r = Math.min(WIDTH, HEIGHT) / 3;
  return nodes.map((n, i) => ({
    ...n,
    x: CENTER.x + r * Math.cos((2 * Math.PI * i) / nodes.length),
    y: CENTER.y + r * Math.sin((2 * Math.PI * i) / nodes.length),
  }));
}

export function simulateLayout(nodes: GraphNode[], edges: GraphEdge[], iterations = 300): PositionedNode[] {
  const positions = initialPositions(nodes);
  const idIndex = new Map(positions.map((n, i) => [n.id, i]));
  const REPULSION = 3000;
  const SPRING_LENGTH = 110;
  const SPRING_STRENGTH = 0.02;
  const CENTER_STRENGTH = 0.008;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = positions.map(() => ({ fx: 0, fy: 0 }));

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        let dx = positions[i].x - positions[j].x;
        let dy = positions[i].y - positions[j].y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          // Deterministic nudge (index-based, not random) to break an exact overlap.
          dx = (i - j) * 0.1;
          dy = (j - i) * 0.1;
          distSq = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces[i].fx += fx;
        forces[i].fy += fy;
        forces[j].fx -= fx;
        forces[j].fy -= fy;
      }
    }

    for (const e of edges) {
      const i = idIndex.get(e.from);
      const j = idIndex.get(e.to);
      if (i === undefined || j === undefined) continue;
      const dx = positions[j].x - positions[i].x;
      const dy = positions[j].y - positions[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces[i].fx += fx;
      forces[i].fy += fy;
      forces[j].fx -= fx;
      forces[j].fy -= fy;
    }

    for (let i = 0; i < positions.length; i++) {
      forces[i].fx += (CENTER.x - positions[i].x) * CENTER_STRENGTH;
      forces[i].fy += (CENTER.y - positions[i].y) * CENTER_STRENGTH;
    }

    for (let i = 0; i < positions.length; i++) {
      positions[i].x += forces[i].fx;
      positions[i].y += forces[i].fy;
    }
  }

  return positions;
}

export function findCycles(nodes: GraphNode[], edges: GraphEdge[]): { edgeKeys: Set<string>; nodeIds: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const edgeKeys = new Set<string>();
  const nodeIds = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    onStack.add(node);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      if (onStack.has(next)) {
        const startIdx = stack.indexOf(next);
        const cycleNodes = stack.slice(startIdx);
        for (const cn of cycleNodes) nodeIds.add(cn);
        for (let k = 0; k < cycleNodes.length - 1; k++) edgeKeys.add(`${cycleNodes[k]}->${cycleNodes[k + 1]}`);
        edgeKeys.add(`${cycleNodes[cycleNodes.length - 1]}->${next}`);
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const n of nodes) if (!visited.has(n.id)) dfs(n.id);
  return { edgeKeys, nodeIds };
}

export function shortestPath(nodes: GraphNode[], edges: GraphEdge[], startId: string, endId: string): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const queue = [startId];
  const visited = new Set([startId]);
  const parent = new Map<string, string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === endId) {
      const path = [cur];
      let p = cur;
      while (parent.has(p)) {
        p = parent.get(p)!;
        path.unshift(p);
      }
      return path;
    }
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        parent.set(next, cur);
        queue.push(next);
      }
    }
  }
  return null;
}

export function DependencyGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [layoutRun, setLayoutRun] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const positions = useMemo(() => simulateLayout(nodes, edges), [nodes, edges, layoutRun]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const cycles = useMemo(() => findCycles(nodes, edges), [nodes, edges]);

  const path = selected.length === 2 ? shortestPath(nodes, edges, selected[0], selected[1]) : null;
  const pathEdgeKeys = useMemo(() => {
    const s = new Set<string>();
    if (path) {
      for (let i = 0; i < path.length - 1; i++) {
        s.add(`${path[i]}->${path[i + 1]}`);
        s.add(`${path[i + 1]}->${path[i]}`);
      }
    }
    return s;
  }, [path]);

  function clickNode(id: string) {
    setSelected((prev) => {
      if (prev.length >= 2 || prev.includes(id)) return [id];
      return [...prev, id];
    });
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button data-testid="recompute-layout" onClick={() => setLayoutRun((r) => r + 1)}>
          Recompute layout
        </button>
        <button data-testid="clear-selection" onClick={() => setSelected([])}>
          Clear path selection
        </button>
      </div>

      <div data-testid="cycle-status" style={{ fontSize: 12, marginBottom: 6, color: cycles.nodeIds.size > 0 ? '#ef4444' : 'inherit' }}>
        {cycles.nodeIds.size > 0 ? `Cycle detected involving: ${[...cycles.nodeIds].join(', ')}` : 'No cycles detected.'}
      </div>

      <svg width={WIDTH} height={HEIGHT} style={{ border: '1px solid #333', background: '#0d1117' }} data-testid="graph-svg">
        {edges.map((e) => {
          const from = posById.get(e.from);
          const to = posById.get(e.to);
          if (!from || !to) return null;
          const key = `${e.from}->${e.to}`;
          const isCycle = cycles.edgeKeys.has(key);
          const isPath = pathEdgeKeys.has(key);
          return (
            <line
              key={key}
              data-testid="graph-edge"
              data-from={e.from}
              data-to={e.to}
              data-cyclic={isCycle}
              data-on-path={isPath}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isCycle ? '#ef4444' : isPath ? '#3b82f6' : '#4b5563'}
              strokeWidth={isCycle || isPath ? 2.5 : 1}
            />
          );
        })}
        {positions.map((n) => {
          const isSelected = selected.includes(n.id);
          const isCyclic = cycles.nodeIds.has(n.id);
          const isOnPath = !!path?.includes(n.id);
          return (
            <g
              key={n.id}
              data-testid="graph-node"
              data-node-id={n.id}
              onClick={() => clickNode(n.id)}
              style={{ cursor: 'pointer' }}
              transform={`translate(${n.x}, ${n.y})`}
            >
              <circle
                r={16}
                fill={isCyclic ? '#7f1d1d' : isOnPath ? '#1e3a5f' : '#21262d'}
                stroke={isSelected ? '#facc15' : isOnPath ? '#3b82f6' : '#4b5563'}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <text textAnchor="middle" dy={4} fontSize={9} fill="white">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div data-testid="path-status" style={{ fontSize: 12, marginTop: 6 }}>
        {path ? `Path: ${path.join(' → ')}` : selected.length === 1 ? 'Click another node to find a path.' : ''}
      </div>
    </div>
  );
}

const NODES: GraphNode[] = [
  { id: 'app', label: 'app' },
  { id: 'ui-kit', label: 'ui-kit' },
  { id: 'router', label: 'router' },
  { id: 'icons', label: 'icons' },
  { id: 'color-utils', label: 'color-utils' },
  { id: 'test-utils', label: 'test-utils' },
];

const EDGES: GraphEdge[] = [
  { from: 'app', to: 'ui-kit' },
  { from: 'app', to: 'router' },
  { from: 'ui-kit', to: 'icons' },
  { from: 'router', to: 'ui-kit' },
  { from: 'icons', to: 'color-utils' },
  { from: 'color-utils', to: 'icons' }, // deliberate cycle: icons <-> color-utils
];

export default function Demo() {
  return <DependencyGraph nodes={NODES} edges={EDGES} />;
}
