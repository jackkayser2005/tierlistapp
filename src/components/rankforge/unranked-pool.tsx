"use client";

import * as React from "react";
import { Inbox, Sparkles } from "lucide-react";
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
    <section
      className={cn(
        "rf-rise overflow-hidden rounded-2xl glass",
        className
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-amber-300">
            <Inbox className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Unranked</h2>
            <p className="text-xs text-muted-foreground">
              {unranked.length} item{unranked.length === 1 ? "" : "s"} waiting to be ranked
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-muted-foreground sm:flex">
          <Sparkles className="size-3 text-amber-300" />
          Drag to rank
        </div>
      </header>

      <DroppableContainer
        id={UNRANKED_ID}
        itemIds={unranked}
        items={items}
        isHighlighted={dragOverContainer === UNRANKED_ID}
        className="min-h-[6rem]"
        emptyState={
          <p className="text-xs text-muted-foreground">
            Nothing here yet — add items from the panel, or pull cards back here.
          </p>
        }
      />
    </section>
  );
}
