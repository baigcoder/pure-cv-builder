"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Props to spread on the element that starts a drag (the grip button). */
export interface DragHandleProps {
  ref: (element: HTMLElement | null) => void;
  [key: string]: unknown;
}

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  /** `isSorting` is true for every item while any item is being dragged. */
  renderItem: (item: T, index: number, handle: DragHandleProps, isDragging: boolean, isSorting: boolean) => ReactNode;
  className?: string;
}

/** A vertical list reorderable by mouse, touch, or keyboard (Space, arrows, Space). */
export function SortableList<T>({ items, getId, onReorder, renderItem, className }: SortableListProps<T>) {
  const sensors = useSensors(
    // A small threshold keeps clicks inside the item from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | number | null>(null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => getId(item) === active.id);
    const to = items.findIndex((item) => getId(item) === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Items may collapse when a drag starts, so keep re-measuring them.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }: DragStartEvent) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableItem key={getId(item)} id={getId(item)}>
              {(handle, isDragging) => renderItem(item, index, handle, isDragging, activeId !== null)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (handle: DragHandleProps, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners }, isDragging)}
    </div>
  );
}
