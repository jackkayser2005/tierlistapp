"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNRANKED_ID } from "@/lib/tierlist";
import { useRankForge } from "@/lib/store";
import { DroppableContainer } from "./droppable-container";

interface UnrankedPoolProps {
  dragOverContainer: string | null;
  className?: string;
}

export function UnrankedPool({
  dragOverContainer,
  className,
}: UnrankedPoolProps) {
  const items = useRankForge((s) => s.items);
  const unranked = useRankForge((s) => s.unranked);

  return (
    <section className={cn("rf-rise overflow-hidden rounded-2xl rf-panel", className)}>
      <header className="rf-no-export flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-white/[0.05] text-foreground/80 ring-1 ring-inset ring-white/5">
            <Inbox className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Unranked</h2>
            <p className="text-xs text-muted-foreground">
              {unranked.length} item{unranked.length === 1 ? "" : "s"} waiting to be ranked
            </p>
          </div>
        </div>
        <span className="rf-section-label hidden sm:inline-flex">staging</span>
      </header>

      <DroppableContainer
        id={UNRANKED_ID}
        itemIds={unranked}
        items={items}
        isHighlighted={dragOverContainer === UNRANKED_ID}
        className="min-h-[5.5rem]"
        emptyState={
          <div className="flex flex-col items-center gap-1.5 py-2">
            <span className="text-sm text-muted-foreground">
              Nothing here yet
            </span>
            <span className="text-xs text-muted-foreground/70">
              Add items from the panel, or pull cards back here.
            </span>
          </div>
        }
      />
    </section>
  );
}
