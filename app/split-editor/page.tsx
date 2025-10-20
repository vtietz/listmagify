/**
 * Split Grid Editor page - allows editing multiple playlists simultaneously.
 */

import { SplitGrid } from '@/components/split/SplitGrid';

export default function SplitEditorPage() {
  return (
    <div className="h-[calc(100vh-3rem)]">
      <SplitGrid />
    </div>
  );
}
