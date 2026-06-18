"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TIER_COLOR_PRESETS } from "@/lib/tierlist";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-9 gap-1.5">
        {TIER_COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Use color ${c}`}
            className={cn(
              "size-6 rounded-md border border-white/15 transition-transform hover:scale-110",
              value.toLowerCase() === c.toLowerCase() &&
                "ring-2 ring-white ring-offset-2 ring-offset-background"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative inline-flex size-9 shrink-0 overflow-hidden rounded-md border border-white/15">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer"
            aria-label="Custom color"
          />
          <span
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: value }}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-input/30 px-2.5 font-mono text-xs uppercase text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50"
          spellCheck={false}
          aria-label="Color hex value"
        />
      </div>
    </div>
  );
}
