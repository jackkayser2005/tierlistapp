"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Flame, Heart } from "lucide-react";
import { useRankForge } from "@/lib/store";
import { UNRANKED_ID } from "@/lib/tierlist";
import { Header } from "./header";
import { TierBoard } from "./tier-board";
import { UnrankedPool } from "./unranked-pool";
import { ControlPanelContent } from "./control-panel";
import { DragOverlayCard } from "./item-card";

/**
 * Custom collision detection: prefer pointer-within, fall back to rect
 * intersection. This feels the most natural for a tier board where rows
 * are large and cards are small.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  const intersections = rectIntersection(args);
  return intersections;
};

function LoadingShell() {
  return (
    <div className="rf-app-bg grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="brand-gradient-bg grid size-12 animate-pulse place-items-center rounded-2xl shadow-lg">
          <Flame className="size-6 text-white" />
        </div>
        <p className="brand-gradient text-lg font-black tracking-tight">
          RankForge
        </p>
        <p className="text-xs text-muted-foreground">Lighting the forge…</p>
      </div>
    </div>
  );
}

export function RankForgeApp() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const moveItem = useRankForge((s) => s.moveItem);
  const findContainerOf = useRankForge((s) => s.findContainerOf);
  const indexOfItem = useRankForge((s) => s.indexOfItem);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [dragOverContainer, setDragOverContainer] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const tierIds = React.useMemo(() => tiers.map((t) => t.id), [tiers]);

  const findContainer = React.useCallback(
    (id: string): string | null => {
      if (id === UNRANKED_ID) return UNRANKED_ID;
      if (tiers.some((t) => t.id === id)) return id;
      return findContainerOf(id);
    },
    [tiers, findContainerOf]
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    setDragOverContainer(findContainer(id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overId = String(over.id);

    const activeContainer = findContainer(activeIdStr);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;

    setDragOverContainer(overContainer);

    if (activeContainer === overContainer) return;

    const isOverItem = over.data.current?.type === "item";
    const toIndex = isOverItem ? indexOfItem(overContainer, overId) : -1;
    moveItem(activeIdStr, activeContainer, overContainer, toIndex);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setDragOverContainer(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overId = String(over.id);
    if (activeIdStr === overId) return;

    const activeContainer = findContainer(activeIdStr);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;

    const isOverItem = over.data.current?.type === "item";
    const toIndex = isOverItem ? indexOfItem(overContainer, overId) : -1;
    moveItem(activeIdStr, activeContainer, overContainer, toIndex);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragOverContainer(null);
  };

  const activeItem = activeId ? items[activeId] : null;

  if (!mounted) return <LoadingShell />;

  return (
    <div className="rf-app-bg flex min-h-screen flex-col">
      <Header />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: "Always" } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Board + unranked */}
            <div className="flex flex-col gap-5">
              <TierBoard dragOverContainer={dragOverContainer} />
              <UnrankedPool dragOverContainer={dragOverContainer} />
            </div>

            {/* Desktop sidebar */}
            <aside className="hidden lg:block">
              <div className="glass rf-scroll sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl p-5">
                <ControlPanelContent />
              </div>
            </aside>
          </div>
        </main>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeItem ? <DragOverlayCard item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      <footer className="mt-auto border-t border-white/10 bg-background/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-amber-300" />
            <span className="font-semibold text-foreground/80">RankForge</span>
            <span className="text-muted-foreground/70">— local-only PoC</span>
          </p>
          <p className="flex items-center gap-1.5">
            Your board auto-saves in this browser
            <Heart className="size-3 text-rose-400" />
          </p>
        </div>
      </footer>
    </div>
  );
}
