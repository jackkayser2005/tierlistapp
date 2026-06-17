"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { TierRow } from "./tier-row";

interface TierBoardProps {
  dragOverContainer: string | null;
}

export function TierBoard({ dragOverContainer }: TierBoardProps) {
  const tiers = useRankForge((s) => s.tiers);

  return (
    <div className="flex flex-col gap-3">
      {tiers.map((tier, index) => (
        <TierRow
          key={tier.id}
          tier={tier}
          index={index}
          total={tiers.length}
          isHighlighted={dragOverContainer === tier.id}
        />
      ))}
    </div>
  );
}
