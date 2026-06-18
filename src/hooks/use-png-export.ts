"use client";

import * as React from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { slugify } from "@/lib/image";

interface ExportOptions {
  title: string;
}

/**
 * Captures the given board node as a PNG. Temporarily adds an
 * `rf-exporting` class so CSS can hide interactive chrome (delete
 * buttons, controls marked `.rf-no-export`) during capture.
 */
export function usePngExport() {
  const exportRef = React.useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = React.useState(false);

  const exportPng = React.useCallback(
    async ({ title }: ExportOptions) => {
      const node = exportRef.current;
      if (!node) {
        toast.error("Nothing to export yet");
        return;
      }
      setExporting(true);
      node.classList.add("rf-exporting");
      // Let the DOM settle (hide chrome) before capture.
      await new Promise((r) => setTimeout(r, 60));
      try {
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: getComputedStyle(document.body)
            .getPropertyValue("--background")
            .trim() || "#0f1014",
          style: {
            borderRadius: "0",
          },
          filter: (el) => {
            // Skip elements explicitly hidden for export.
            if (el instanceof HTMLElement && el.dataset.rfSkip === "true") {
              return false;
            }
            return true;
          },
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `rankforge-${slugify(title)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("Board exported as PNG");
      } catch (err) {
        console.error(err);
        toast.error("Couldn't export the image");
      } finally {
        node.classList.remove("rf-exporting");
        setExporting(false);
      }
    },
    []
  );

  return { exportRef, exporting, exportPng };
}
