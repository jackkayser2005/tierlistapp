"use client";

import * as React from "react";
import {
  Plus,
  Type,
  Link as LinkIcon,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  ClipboardCopy,
  FolderOpen,
  RotateCcw,
  Palette,
  Layers,
  FileJson,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRankForge, buildExport } from "@/lib/store";
import { normalizeBoard, type RankForgeBoard } from "@/lib/tierlist";
import { ColorPicker } from "./color-picker";
import { downscaleImage, readFileAsDataURL, slugify } from "@/lib/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

function Section({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-white/5 text-amber-300">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function AddItemSection() {
  const addItem = useRankForge((s) => s.addItem);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [text, setText] = React.useState("");
  const [imgLabel, setImgLabel] = React.useState("");
  const [imgUrl, setImgUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const addText = () => {
    const v = text.trim();
    if (!v) return;
    addItem({ type: "text", label: v });
    setText("");
    toast.success("Card added to Unranked");
  };

  const addImageUrl = async () => {
    const url = imgUrl.trim();
    const label = imgLabel.trim() || "Image";
    if (!url) return;
    setBusy(true);
    try {
      // Verify the URL resolves before adding.
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load image URL"));
        img.src = url;
      });
      addItem({ type: "image", label, imageUrl: url });
      setImgUrl("");
      setImgLabel("");
      toast.success("Image card added to Unranked");
    } catch {
      toast.error("That image URL couldn't be loaded");
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const raw = await readFileAsDataURL(file);
        const dataUrl = await downscaleImage(raw, 480, 0.85);
        const label = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image";
        addItem({ type: "image", label, imageUrl: dataUrl });
      }
      toast.success(
        `${files.length} image${files.length === 1 ? "" : "s"} added to Unranked`
      );
    } catch {
      toast.error("Could not process that image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Section
      title="Add items"
      icon={Plus}
      description="Cards land in Unranked — then drag them onto tiers."
    >
      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="text" className="gap-1">
            <Type className="size-3.5" /> Text
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-1">
            <LinkIcon className="size-3.5" /> URL
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1">
            <Upload className="size-3.5" /> Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={text}
              placeholder="e.g. The Office, Tacos, That one meme…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addText();
              }}
            />
            <Button onClick={addText} size="icon" aria-label="Add text card">
              <Plus className="size-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="url" className="mt-3 space-y-2">
          <Input
            value={imgLabel}
            placeholder="Label (optional)"
            onChange={(e) => setImgLabel(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              value={imgUrl}
              placeholder="https://…/image.jpg"
              onChange={(e) => setImgUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addImageUrl();
              }}
            />
            <Button
              onClick={addImageUrl}
              size="icon"
              disabled={busy || !imgUrl.trim()}
              aria-label="Add image from URL"
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste any public image link.
          </p>
        </TabsContent>

        <TabsContent value="upload" className="mt-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition hover:border-amber-300/50 hover:bg-white/[0.06] disabled:opacity-50"
          >
            <Upload className="size-5 text-amber-300" />
            <span className="text-sm font-medium">
              {busy ? "Processing…" : "Click to upload images"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              PNG, JPG, GIF — multiple files supported
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function TiersSection() {
  const tiers = useRankForge((s) => s.tiers);
  const addTier = useRankForge((s) => s.addTier);
  const updateTier = useRankForge((s) => s.updateTier);
  const reorderTier = useRankForge((s) => s.reorderTier);
  const deleteTier = useRankForge((s) => s.deleteTier);

  return (
    <Section
      title="Tiers"
      icon={Layers}
      description={`${tiers.length} tier${tiers.length === 1 ? "" : "s"} — reorder, recolor, or add more.`}
    >
      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2"
          >
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="size-8 shrink-0 rounded-lg border border-white/15 transition hover:scale-105"
                  style={{ backgroundColor: tier.color }}
                  aria-label={`Change color for ${tier.name}`}
                >
                  <Palette className="hidden" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3" align="start">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Tier color
                </p>
                <ColorPicker
                  value={tier.color}
                  onChange={(c) => updateTier(tier.id, { color: c })}
                />
              </PopoverContent>
            </Popover>

            <Input
              value={tier.name}
              maxLength={14}
              onChange={(e) => updateTier(tier.id, { name: e.target.value })}
              className="h-8 flex-1 font-semibold"
            />

            <div className="flex items-center">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === 0}
                onClick={() => reorderTier(tier.id, "up")}
                aria-label="Move tier up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === tiers.length - 1}
                onClick={() => reorderTier(tier.id, "down")}
                aria-label="Move tier down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  deleteTier(tier.id);
                  toast(`Tier “${tier.name}” deleted`, {
                    description: "Its items moved to Unranked.",
                  });
                }}
                aria-label="Delete tier"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={() => {
          addTier();
          toast.success("Tier added");
        }}
      >
        <Plus className="size-4" /> Add tier
      </Button>
    </Section>
  );
}

function BoardSection() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const setMeta = useRankForge((s) => s.setMeta);
  const resetBoard = useRankForge((s) => s.resetBoard);

  return (
    <Section title="Board" icon={FileJson} description="Name your list and start fresh.">
      <div className="space-y-2">
        <Input
          value={title}
          maxLength={60}
          placeholder="Tier list title"
          onChange={(e) => setMeta({ title: e.target.value })}
        />
        <Textarea
          value={description}
          maxLength={140}
          placeholder="Short description"
          rows={2}
          onChange={(e) => setMeta({ description: e.target.value })}
        />
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="w-full text-destructive hover:text-destructive">
            <RotateCcw className="size-4" /> Reset to starter board
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the board?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current tiers and items with the starter
              board. Your current list will be lost. Consider exporting it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                resetBoard();
                toast.success("Board reset to starter");
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function ShareSection() {
  const title = useRankForge((s) => s.title);
  const description = useRankForge((s) => s.description);
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const tierItems = useRankForge((s) => s.tierItems);
  const unranked = useRankForge((s) => s.unranked);
  const loadBoard = useRankForge((s) => s.loadBoard);
  const importRef = React.useRef<HTMLInputElement>(null);

  const getBoard = React.useCallback<() => RankForgeBoard>(
    () => ({
      title,
      description,
      tiers,
      items,
      tierItems,
      unranked,
    }),
    [title, description, tiers, items, tierItems, unranked]
  );

  const handleExport = () => {
    const payload = buildExport(getBoard());
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rankforge-${slugify(title)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported JSON file");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(buildExport(getBoard()), null, 2)
      );
      toast.success("Board JSON copied to clipboard");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const board = normalizeBoard(parsed);
      loadBoard(board);
      toast.success("Tier list imported");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import that file"
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <Section title="Save & share" icon={Download} description="Export to share, import to reload.">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleExport} className="col-span-2 brand-gradient-bg text-white hover:opacity-90">
          <Download className="size-4" /> Export JSON
        </Button>
        <Button variant="outline" onClick={handleCopy}>
          <ClipboardCopy className="size-4" /> Copy
        </Button>
        <Button variant="outline" onClick={() => importRef.current?.click()}>
          <FolderOpen className="size-4" /> Import
        </Button>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => handleImportFile(e.target.files)}
      />
      <p className="text-[11px] text-muted-foreground">
        Everything also auto-saves to this browser.
      </p>
    </Section>
  );
}

export function ControlPanelContent({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      <AddItemSection />
      <TiersSection />
      <BoardSection />
      <ShareSection />
    </div>
  );
}
