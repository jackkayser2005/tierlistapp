"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
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
import { Input } from "@/components/ui/input";
import { useRankForge } from "@/lib/store";
import { UNRANKED_ID } from "@/lib/tierlist";
import { usePngExport } from "@/hooks/use-png-export";
import { Header } from "./header";
import { TierBoard } from "./tier-board";
import { UnrankedPool } from "./unranked-pool";
import { ControlPanelContent } from "./control-panel";
import { DragOverlayCard } from "./item-card";

/**
 * Custom collision detection: prefer pointer-within, fall back to rect
 * intersection. Feels most natural for a tier board with large rows.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

function LoadingShell() {
  return (
    <div className="rf-app-bg grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rf-brand grid size-12 animate-pulse place-items-center rounded-2xl shadow-lg">
          <Flame className="size-6 text-white" />
        </div>
        <p className="rf-brand-text text-lg font-black tracking-tight">
          RankForge
        </p>
        <p className="text-xs text-muted-foreground">Lighting the forge…</p>
      </div>
    </div>
  );
}

function BoardHeader() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const setMeta = useRankForge((s) => s.setMeta);
  const itemCount = useRankForge((s) => Object.keys(s.items).length);

  return (
    <div className="mb-5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          maxLength={60}
          placeholder="Untitled tier list"
          onChange={(e) => setMeta({ title: e.target.value })}
          className="border-0 bg-transparent px-0 text-xl font-bold tracking-tight shadow-none focus-visible:ring-0 sm:text-2xl"
        />
        <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline">
          {itemCount} items
        </span>
      </div>
      <Input
        value={description}
        maxLength={140}
        placeholder="Add a short description…"
        onChange={(e) => setMeta({ description: e.target.value })}
        className="border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
      />
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
  const title = useRankForge((s) => s.title);

  const { exportRef, exporting, exportPng } = usePngExport();

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

  const findContainer = React.useCallback(
    (id: string): string | null => {
      if (id === UNRANKED_ID) return UNRANKED_ID;
      if (tiers.some((t) => t.id === id)) return id;
      return findContainerOf(id);
    },
    [tiers, findContainerOf]
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDragOverContainer(findContainer(String(e.active.id)));
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

  const handleExport = () => exportPng({ title });

  return (
    <div className="rf-app-bg flex min-h-screen flex-col">
      <Header onExportPng={handleExport} exporting={exporting} />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: "Always" } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Board + unranked — wrapped for PNG capture */}
            <div ref={exportRef} className="rf-export-bg rounded-2xl">
              <BoardHeader />
              <div className="flex flex-col gap-4">
                <TierBoard dragOverContainer={dragOverContainer} />
                <UnrankedPool dragOverContainer={dragOverContainer} />
              </div>
            </div>

            {/* Desktop sidebar */}
            <aside className="hidden lg:block">
              <div className="rf-panel rf-scroll sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl p-5">
                <ControlPanelContent
                  onExportPng={handleExport}
                  exporting={exporting}
                />
              </div>
            </aside>
          </div>
        </main>

        <DragOverlay
          dropAnimation={{
            duration: 180,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeItem ? <DragOverlayCard item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      <footer className="mt-auto border-t border-white/[0.06] bg-background/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-amber-300" />
            <span className="font-semibold text-foreground/80">RankForge</span>
            <span className="text-muted-foreground/60">— local &amp; live PoC</span>
          </p>
          <p className="flex items-center gap-1.5">
            Auto-saves to your browser
            <Heart className="size-3 text-rose-400" />
          </p>
        </div>
      </footer>
    </div>
  );
}
