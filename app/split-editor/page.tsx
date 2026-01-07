/**
 * Split Grid Editor page - allows editing multiple playlists simultaneously.
 */

import { Suspense } from 'react';
import { SplitGrid } from '@/components/split-editor/SplitGrid';

function SplitEditorLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-muted-foreground">Loading editor...</div>
    </div>
  );
}

export default function SplitEditorPage() {
  return (
    <div className="h-full">
      <Suspense fallback={<SplitEditorLoading />}>
        <SplitGrid />
      </Suspense>
    </div>
  );
}
