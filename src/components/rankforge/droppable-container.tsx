"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { TierItem } from "@/lib/tierlist";
import { SortableItemCard } from "./item-card";

interface DroppableContainerProps {
  id: string;
  itemIds: string[];
  items: Record<string, TierItem>;
  isHighlighted: boolean;
  className?: string;
  emptyState?: React.ReactNode;
}

/**
 * A drop target that also hosts a SortableContext of cards.
 * Used for both tier rows and the unranked pool.
 */
export function DroppableContainer({
  id,
  itemIds,
  items,
  isHighlighted,
  className,
  emptyState,
}: DroppableContainerProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "container", containerId: id },
  });

  return (
    <SortableContext items={itemIds} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(
          "rf-scroll flex flex-wrap content-start gap-2 p-3 transition-colors duration-150",
          (isOver || isHighlighted) && "rf-drop-active",
          className
        )}
      >
        {itemIds.length === 0 && emptyState ? (
          <div className="flex w-full items-center justify-center py-2 text-center">
            {emptyState}
          </div>
        ) : (
          itemIds.map((itemId) => {
            const item = items[itemId];
            if (!item) return null;
            return (
              <SortableItemCard key={itemId} item={item} containerId={id} />
            );
          })
        )}
      </div>
    </SortableContext>
  );
}
