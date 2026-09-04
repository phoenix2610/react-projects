// Gantt Timeline Viewer
//
// A zoomable day-axis (pixels-per-day scales every bar and arrow together),
// dependency arrows drawn as elbow connectors between a prerequisite's end
// and its dependent's start, and drag-to-reschedule with a real cascade:
// dragging a task pushes any dependent that would now start before its
// prerequisite ends forward by exactly enough, recursively through the
// whole chain — so moving the first task in a dependency graph moves
// everything downstream of it, the way an actual project plan would.
//
// Dates are plain integer day-offsets from a reference date rather than
// `Date` objects, since the arithmetic (durations, shifting, pixel
// positions) is exact integer math either way and this sidesteps timezone
// concerns entirely for a component that's really just demonstrating
// layout and scheduling logic.
//
// Usage:
//   <GanttChart tasks={tasks} />

import { useState } from 'react';

export interface Task {
  id: string;
  label: string;
  start: number; // day offset
  end: number; // day offset (exclusive)
  dependsOn: string[];
}

const ROW_HEIGHT = 36;
const BAR_HEIGHT = 22;
const LABEL_WIDTH = 90;

export function rescheduleTask(tasks: Task[], taskId: string, newStart: number): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const updated = new Map(byId);

  function shift(id: string, start: number) {
    const t = updated.get(id);
    if (!t) return;
    const duration = t.end - t.start;
    const newEnd = start + duration;
    updated.set(id, { ...t, start, end: newEnd });
    for (const other of tasks) {
      if (other.dependsOn.includes(id)) {
        const otherTask = updated.get(other.id)!;
        if (otherTask.start < newEnd) shift(other.id, newEnd);
      }
    }
  }

  shift(taskId, newStart);
  return tasks.map((t) => updated.get(t.id)!);
}

function elbowPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const midX = fromX + Math.max(10, (toX - fromX) / 2);
  return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
}

export function GanttChart({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pxPerDay, setPxPerDay] = useState(30);
  const [drag, setDrag] = useState<{ id: string; startX: number; originalStart: number } | null>(null);

  const rowIndex = new Map(tasks.map((t, i) => [t.id, i]));
  const maxEnd = Math.max(...tasks.map((t) => t.end), 1);
  const chartWidth = maxEnd * pxPerDay + 40;

  function onPointerDown(e: React.PointerEvent, task: Task) {
    setDrag({ id: task.id, startX: e.clientX, originalStart: task.start });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaPx = e.clientX - drag.startX;
    const deltaDays = Math.round(deltaPx / pxPerDay);
    const newStart = Math.max(0, drag.originalStart + deltaDays);
    setTasks((prev) => rescheduleTask(prev, drag.id, newStart));
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 6 }}>
        <button data-testid="zoom-out" onClick={() => setPxPerDay((z) => Math.max(10, Math.round(z / 1.5)))}>
          Zoom out
        </button>
        <button data-testid="zoom-in" onClick={() => setPxPerDay((z) => Math.min(120, Math.round(z * 1.5)))} style={{ marginLeft: 4 }}>
          Zoom in
        </button>
        <span data-testid="px-per-day" style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
          {pxPerDay}px/day
        </span>
      </div>

      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }}>
          <div style={{ height: 20 }} />
          {tasks.map((t) => (
            <div key={t.id} style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', fontSize: 12 }}>
              {t.label}
            </div>
          ))}
        </div>

        <div
          style={{ position: 'relative', overflowX: 'auto', width: 380 }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
        >
          <svg width={chartWidth} height={20 + tasks.length * ROW_HEIGHT} data-testid="gantt-svg">
            {Array.from({ length: maxEnd + 1 }, (_, day) => (
              <g key={day}>
                <line x1={day * pxPerDay} y1={16} x2={day * pxPerDay} y2={20 + tasks.length * ROW_HEIGHT} stroke="#222" strokeWidth={1} />
                {(pxPerDay >= 24 || day % 2 === 0) && (
                  <text x={day * pxPerDay + 2} y={12} fontSize={9} fill="#888">
                    {day}
                  </text>
                )}
              </g>
            ))}

            {tasks.flatMap((t) =>
              t.dependsOn.map((depId) => {
                const dep = tasks.find((x) => x.id === depId);
                if (!dep) return null;
                const fromX = dep.end * pxPerDay;
                const fromY = 20 + rowIndex.get(dep.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
                const toX = t.start * pxPerDay;
                const toY = 20 + rowIndex.get(t.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
                return (
                  <path
                    key={`${depId}->${t.id}`}
                    data-testid="dependency-arrow"
                    data-from={depId}
                    data-to={t.id}
                    d={elbowPath(fromX, fromY, toX, toY)}
                    fill="none"
                    stroke="#6b7280"
                    strokeWidth={1.5}
                  />
                );
              }),
            )}

            {tasks.map((t) => {
              const y = 20 + rowIndex.get(t.id)! * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              return (
                <rect
                  key={t.id}
                  data-testid="task-bar"
                  data-task-id={t.id}
                  data-start={t.start}
                  data-end={t.end}
                  x={t.start * pxPerDay}
                  y={y}
                  width={(t.end - t.start) * pxPerDay}
                  height={BAR_HEIGHT}
                  rx={4}
                  fill={drag?.id === t.id ? '#3b82f6' : '#1e3a5f'}
                  stroke="#3b82f6"
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => onPointerDown(e, t)}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

const TASKS: Task[] = [
  { id: 'design', label: 'Design', start: 0, end: 3, dependsOn: [] },
  { id: 'build', label: 'Build', start: 3, end: 8, dependsOn: ['design'] },
  { id: 'docs', label: 'Docs', start: 3, end: 6, dependsOn: ['design'] },
  { id: 'test', label: 'Test', start: 8, end: 11, dependsOn: ['build'] },
  { id: 'deploy', label: 'Deploy', start: 11, end: 12, dependsOn: ['test', 'docs'] },
];

export default function Demo() {
  return <GanttChart initialTasks={TASKS} />;
}
