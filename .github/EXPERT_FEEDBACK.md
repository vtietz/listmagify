# Expert Feedback: Cross-Panel DnD Implementation

## Date: October 20, 2025

## Summary
Implemented the expert's recommended multi-container DnD pattern but encountered a **regression** - lost panel highlighting and still no "make room" animation.

---

## What We Implemented (Following Expert Plan)

### ✅ Stage 1: Collision Detection & Remove Competing Droppable
- Changed `collisionDetection` from `closestCenter` to `pointerWithin` in DndContext
- Removed `useDroppable` hook from PlaylistPanel
- Removed droppable ref from panel container div
- Track items (via useSortable) are now the only droppable targets

### ✅ Stage 2: Ephemeral Insertion for "Make Room"
Added state in SplitGrid:
```typescript
const [activeId, setActiveId] = useState<string | null>(null);
const [ephemeralInsertion, setEphemeralInsertion] = useState<{
  panelId: string;
  activeId: string;
  insertionIndex: number;
} | null>(null);
```

Modified handleDragStart:
```typescript
const trackId = active.id as string;
setActiveId(trackId);
```

Modified handleDragOver:
```typescript
// Only process when over.data.current.type === 'track'
if (!targetData || targetData.type !== 'track') {
  setEphemeralInsertion(null);
  return;
}

// Compute insertion index in filtered view
const insertionIndexFiltered = /* pointer Y → virtualizer → index */;

// Set ephemeral insertion
setEphemeralInsertion({
  panelId: targetPanelId,
  activeId,
  insertionIndex: insertionIndexFiltered,
});
```

Modified PlaylistPanel:
```typescript
// Compute contextItems with ephemeral activeId spliced in
const contextItems = useMemo(() => {
  const baseItems = filteredTracks.map((t) => t.id || t.uri);
  
  if (ephemeralInsertion && !baseItems.includes(ephemeralInsertion.activeId)) {
    const itemsCopy = [...baseItems];
    itemsCopy.splice(ephemeralInsertion.insertionIndex, 0, ephemeralInsertion.activeId);
    return itemsCopy;
  }
  
  return baseItems;
}, [filteredTracks, ephemeralInsertion]);

// Pass to SortableContext
<SortableContext items={contextItems} strategy={verticalListSortingStrategy}>
```

---

## User Feedback: REGRESSION ❌

### Before Implementation
- ✅ Panel highlighting worked (blue border on active drop target)
- ❌ No "make room" animation

### After Implementation
- ❌ Panel highlighting **STOPPED WORKING** (no blue border)
- ❌ Still no "make room" animation
- ❌ **NET RESULT: Got WORSE**

### Why It Got Worse

**Root Cause: `pointerWithin` is too strict**

With virtualized lists, there are gaps between track rows:
- Empty space between tracks
- Panel padding/margins
- Scrollbar area
- Header/toolbar areas

When the pointer is in any of these areas, `pointerWithin` collision detection returns **no `over` target**, causing:

```typescript
const handleDragOver = (event: DragOverEvent) => {
  const { over } = event;
  
  if (!over || !activeId) {
    // ❌ This fires constantly when in gaps between tracks
    setActivePanelId(null); // Panel highlight disappears!
    setEphemeralInsertion(null); // "Make room" state cleared!
    return;
  }
  // ...
}
```

Result: Ephemeral state flickers on/off rapidly as mouse moves between tracks.

---

## What We Learned

### The Expert's Plan Had a Gap
The expert said:
> "Remove panel-level droppable or de-prioritize it"

But we need **BOTH**:

1. **Panel-level droppable** (`useDroppable`)
   - Detects "mouse is over this panel area" (including gaps)
   - Enables panel highlighting
   - Enables panel switching
   - Enables auto-scroll detection

2. **Track-level sortables** (`useSortable`)
   - Provides precise "over which track" information
   - Enables "make room" animation via SortableContext

### The Real Solution (Hypothesis)

**Use HYBRID collision detection:**

```typescript
// Custom collision detection that combines strategies
const hybridCollisionDetection = (args) => {
  // First, try pointerWithin for precise track targeting
  const pointerCollision = pointerWithin(args);
  if (pointerCollision.length > 0) {
    // Filter to prefer track items over panel containers
    const trackCollision = pointerCollision.find(
      c => c.data?.current?.type === 'track'
    );
    if (trackCollision) return [trackCollision];
  }
  
  // Fallback: Use closestCenter to detect panel area
  return closestCenter(args);
};
```

This way:
- When over a track: Use precise pointer detection → triggers "make room"
- When over gaps/background: Use panel container → maintains highlight

**OR** keep both droppables with priority:

1. Keep `useDroppable` on panel
2. Keep `useSortable` on tracks
3. In `handleDragOver`, check `over.data.current.type`:
   - If `'track'`: Set ephemeral insertion
   - If `'panel'`: Just set activePanelId (highlight only)

---

## Questions for Expert

1. **Is hybrid collision detection the right approach?** Or should we use a different strategy?

2. **Should we keep panel-level droppable alongside track sortables?** How do we ensure tracks take priority for "make room" while panel provides highlight?

3. **Is there a better pattern for handling gaps in virtualized lists?** The expert plan assumes continuous coverage, but virtualization creates gaps.

4. **Are we correctly implementing the multi-container pattern?** The contextItems computation looks correct, but items still don't shift.

---

## Test Case

Created human-readable test spec at:
`tests/unit/crossPanelDragDrop.test.tsx`

Covers:
- ✅ "Make room" animation during cross-panel drag
- ✅ Source panel freezing (no scroll)
- ✅ Target panel auto-scroll near edges
- ✅ Filtered view → global position mapping
- ✅ Drag cancel (ESC) state cleanup

**Please review test case and help us implement assertions that verify correct behavior.**

---

## Request

Can you provide:
1. **Corrected implementation** that addresses the regression
2. **Working code example** for hybrid collision detection OR panel+track droppable pattern
3. **Guidance on test implementation** to verify "make room" animation in testing-library

Thank you! 🙏
