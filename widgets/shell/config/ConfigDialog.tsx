'use client';

import { GitCompare, Minimize2, TextCursorInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfigDialogDraft } from '@widgets/shell/config/useConfigDialogDraft';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCompact: boolean;
  setCompact: (value: boolean) => void;
  isAutoScrollText: boolean;
  setAutoScrollText: (value: boolean) => void;
  isCompareEnabled: boolean;
  setCompareEnabled: (value: boolean) => void;
  supportsCompare: boolean;
}

export function ConfigDialog({
  open,
  onOpenChange,
  isCompact,
  setCompact,
  isAutoScrollText,
  setAutoScrollText,
  isCompareEnabled,
  setCompareEnabled,
  supportsCompare,
}: ConfigDialogProps) {
  const {
    draftConvertThreshold,
    setDraftConvertThreshold,
    draftCompact,
    setDraftCompact,
    draftAutoScrollText,
    setDraftAutoScrollText,
    draftCompareMode,
    setDraftCompareMode,
    handleSaveConfig,
  } = useConfigDialogDraft({
    open,
    onOpenChange,
    isCompact,
    setCompact,
    isAutoScrollText,
    setAutoScrollText,
    isCompareEnabled,
    setCompareEnabled,
    supportsCompare,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          <section className="space-y-2">
            <div className="text-sm font-medium">View toggles</div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Minimize2 className="h-4 w-4" />
                  <span>Compact</span>
                </div>
                <Switch
                  checked={draftCompact}
                  onCheckedChange={setDraftCompact}
                  aria-label="Toggle compact mode"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <TextCursorInput className="h-4 w-4" />
                  <span>Scroll Text</span>
                </div>
                <Switch
                  checked={draftAutoScrollText}
                  onCheckedChange={setDraftAutoScrollText}
                  aria-label="Toggle scroll text mode"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <GitCompare className="h-4 w-4" />
                  <span>Compare Mode</span>
                </div>
                <Switch
                  checked={draftCompareMode}
                  onCheckedChange={setDraftCompareMode}
                  disabled={!supportsCompare}
                  aria-label="Toggle compare mode"
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Auto-match confidence</span>
              <span className="text-muted-foreground">{draftConvertThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={75}
              max={95}
              step={1}
              value={Math.round(draftConvertThreshold * 100)}
              onChange={(event) => setDraftConvertThreshold(Number(event.target.value) / 100)}
              className="w-full accent-primary"
              aria-label="Auto-match confidence threshold"
            />
            <p className="text-xs text-muted-foreground">
              Matching confidence controls automatic conversion between providers. ISRC is tried first, then text search fallback. Higher values are stricter and route more tracks to manual review; manual review threshold: {Math.max(0.5, draftConvertThreshold - 0.1).toFixed(2)}.
            </p>
          </section>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveConfig}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}