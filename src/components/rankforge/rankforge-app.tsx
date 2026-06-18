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
import { MultiplayerProvider, useMultiplayer } from "@/hooks/use-multiplayer";
import { Header } from "./header";
import { TierBoard } from "./tier-board";
import { UnrankedPool } from "./unranked-pool";
import { ControlPanelContent } from "./control-panel";
import { MultiplayerPanel } from "./multiplayer-panel";
import { VotingControls } from "./voting-controls";
import { ActivityFeed } from "./activity-feed";
import { DragOverlayCard } from "./item-card";
import { VotingModeProvider } from "./voting-context";
import { VotingOverlay } from "./voting-overlay";

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

/** Editable header shown in the live app (hidden during PNG export). */
function BoardHeader() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const setMeta = useRankForge((s) => s.setMeta);
  const itemCount = useRankForge((s) => Object.keys(s.items).length);

  return (
    <div className="rf-no-export mb-5 space-y-1.5">
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

/** Static branded header rendered only in the PNG export. */
function ExportHeader() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const itemCount = useRankForge((s) => Object.keys(s.items).length);
  return (
    <div className="rf-export-only mb-5">
      <div className="flex items-center gap-2.5">
        <div className="rf-brand grid size-8 place-items-center rounded-lg">
          <Flame className="size-4 text-white" />
        </div>
        <span className="text-sm font-black tracking-tight rf-brand-text">
          RankForge
        </span>
      </div>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">
        {title || "Untitled tier list"}
      </h1>
      {description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        {itemCount} items · made with RankForge
      </p>
    </div>
  );
}

export function RankForgeApp() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <LoadingShell />;

  return (
    <MultiplayerProvider>
      <RankForgeInner />
    </MultiplayerProvider>
  );
}

function RankForgeInner() {
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const moveItem = useRankForge((s) => s.moveItem);
  const findContainerOf = useRankForge((s) => s.findContainerOf);
  const indexOfItem = useRankForge((s) => s.indexOfItem);
  const title = useRankForge((s) => s.title);

  const { exportRef, exporting, exportPng } = usePngExport();
  const { setPresence, logActivity, status } = useMultiplayer();
  const dragStartContainerRef = React.useRef<string | null>(null);

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
    const c = findContainer(String(e.active.id));
    dragStartContainerRef.current = c;
    setDragOverContainer(c);
    if (status === "connected") setPresence("dragging");
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
    if (status === "connected") setPresence("online");

    const activeIdStr = String(active.id);
    const overId = String(over.id);
    const fromContainer = dragStartContainerRef.current;
    dragStartContainerRef.current = null;

    if (!over) return;
    if (activeIdStr === overId) return;

    const activeContainer = findContainer(activeIdStr);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;

    const isOverItem = over.data.current?.type === "item";
    const toIndex = isOverItem ? indexOfItem(overContainer, overId) : -1;
    moveItem(activeIdStr, activeContainer, overContainer, toIndex);

    // Log the move activity (only if it crossed containers or visibly moved).
    if (status === "connected" && activeContainer !== overContainer) {
      const item = items[activeIdStr];
      if (item) {
        const toName =
          overContainer === UNRANKED_ID
            ? "Unranked"
            : tiers.find((t) => t.id === overContainer)?.name ?? "a tier";
        logActivity("moved", `${item.label} to ${toName}`);
      }
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragOverContainer(null);
    dragStartContainerRef.current = null;
    if (status === "connected") setPresence("online");
  };

  const activeItem = activeId ? items[activeId] : null;

  const handleExport = () => exportPng({ title });

  return (
    <VotingModeProvider>
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
                <div ref={exportRef} className="rf-export-shell rounded-2xl">
                  <ExportHeader />
                  <BoardHeader />
                  <div className="flex flex-col gap-4">
                    <TierBoard dragOverContainer={dragOverContainer} />
                    <UnrankedPool dragOverContainer={dragOverContainer} />
                  </div>
                </div>

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

          <VotingOverlay />

          <footer className="mt-auto border-t border-white/[0.06] bg-background/40 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
              <p className="flex items-center gap-1.5">
                <Flame className="size-3.5 text-violet-300" />
                <span className="font-semibold text-foreground/80">RankForge</span>
                <span className="text-muted-foreground/60">— live &amp; local</span>
              </p>
              <p className="flex items-center gap-1.5">
                Auto-saves to your browser
                <Heart className="size-3 text-rose-400" />
              </p>
            </div>
          </footer>
      </div>
    </VotingModeProvider>
  );
}
