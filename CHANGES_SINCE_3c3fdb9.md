# Changes Since Commit 3c3fdb93c1e3e63f53955d1fe7b9d2cfb71ee3a6

**Baseline Commit:** `3c3fdb93c1e3e63f53955d1fe7b9d2cfb71ee3a6` (Jan 17, 2026)  
**Message:** "New: added spotify username for access requests"

---

## 1. Docker Build Cache Improvements (Commit 74f7fea)

**Goal:** Speed up Docker builds by reusing cached layers

### Changes to `run.sh`:
- Added `--build-arg BUILDKIT_INLINE_CACHE=1` to production builds
- Modified `prod-build` command to use `--cache-from` for layer reuse
- Enhanced `prod-update` to support `--no-cache` flag for forced rebuilds
- Added `prod-clean` command with options to clean Docker cache and volumes

### Changes to `run.bat`:
- Added `--build-arg BUILDKIT_INLINE_CACHE=1` to production builds
- Enhanced Windows batch file with same cache flags as Linux version

**Key Feature:** Docker now caches build layers in the image registry, dramatically reducing rebuild times from ~10 minutes to ~2 minutes.

---

## 2. GitHub Actions CI/CD Pipeline (Commit 4bc3a48, 27d4bef)

**Goal:** Automate Docker image building and publishing to GitHub Container Registry

### New File: `.github/workflows/docker-build.yml`

**Workflow Triggers:**
- After successful CI workflow completion on `main` branch
- On release creation
- Manual dispatch via GitHub UI

**What It Does:**
1. Checks out repository
2. Sets up Docker Buildx (multi-platform builds)
3. Logs into `ghcr.io` (GitHub Container Registry)
4. Extracts metadata (tags, labels) for Docker image
5. Builds production Docker image from `docker/Dockerfile.prod`
6. Pushes to `ghcr.io/vtietz/listmagify` with multiple tags:
   - `latest` (for main branch)
   - `main-<sha>` (commit-specific)
   - `v1.0.0` (semantic version on releases)
7. Uses registry cache (`buildcache` tag) to speed up builds

**Image Tags Generated:**
```
ghcr.io/vtietz/listmagify:latest
ghcr.io/vtietz/listmagify:main
ghcr.io/vtietz/listmagify:main-<commit-sha>
ghcr.io/vtietz/listmagify:v1.0.0 (on release)
```

### Changes to `docker/docker-compose.prod.yml`:
- Changed image source from `listmagify-prod` (local build) to `ghcr.io/vtietz/listmagify:latest`
- Enables pulling pre-built images instead of building locally

### Changes to `run.sh` Production Commands:
- `prod-up`: Now pulls image from `ghcr.io` instead of building locally
- Added `prod-pull` command to fetch latest image from registry
- `prod-update`: Now pulls + restarts instead of rebuild + restart (much faster)

### Changes to `run.bat` Production Commands:
- Same changes as `run.sh` for Windows compatibility

### Changes to `README.md`:
- Added "Production Setup" section with two deployment options:
  1. **Option 1 (Recommended):** Pull pre-built images from GitHub Container Registry
  2. **Option 2:** Build locally with custom modifications
- Added commands for pulling and updating production deployments
- Documented faster update workflow (~2 minutes instead of ~10 minutes)

**Impact:** Production deployments can now pull pre-built, tested images in ~2 minutes instead of building from scratch for ~10 minutes.

---

## 3. Stats Page Improvements (Commit d04bad5)

**Goal:** Improve visual presentation and UX of stats dashboard

### Changes to `components/stats/StatsDashboard.tsx`:
- Restructured layout with better grid organization
- Added database size metric display (MB) in Overview section
- Improved section navigation and responsiveness
- Enhanced KPI cards with better spacing and colors

### Changes to `components/stats/cards/TrafficStatsCard.tsx`:
- Complete redesign with modern card-based layout
- Separated traffic metrics into distinct cards:
  - Total Visits card (with daily average)
  - Daily Views bar chart (interactive with tooltips)
  - Top Pages list (with visit counts)
  - Top Referrers list (with domain and counts)
  - Top Search Queries (Google/Bing searches leading to site)
  - Top UTM Sources (campaign tracking)
  - Top Countries (geographic distribution)
- Added visual bar indicators for relative comparison
- Improved empty state messages
- Better mobile responsiveness

### Changes to `components/stats/cards/UserRegistrationChart.tsx`:
- Redesigned with interactive bar chart using tooltips
- Shows daily first-time logins with hover details
- Added date range labels below chart
- Improved empty state handling

### New File: `components/stats/charts/UserGrowthChart.tsx`:
- Created dedicated component for user growth visualization
- Shows new users per day over time
- Interactive tooltips with formatted dates
- Cumulative user count tracking

### Changes to `components/stats/components/KPICard.tsx`:
- Minor styling adjustments for consistency

---

## 4. Active Users Definition Improvement (Commit 2233329)

**Goal:** More accurate definition of "active users" and add database size tracking

### Changes to `app/api/stats/overview/route.ts`:
- Updated to return database size statistics (bytes and MB)
- Passes through `getDbSize()` result to frontend

### Changes to `lib/metrics/aggregations.ts`:
- **Changed Active Users Definition:**
  - **Old:** Users who logged in during the period
  - **New:** Users who performed at least one action (track add/remove/reorder) during the period
  - More accurate representation of engaged users vs just authenticated users
- Added detailed comments explaining the difference

### Changes to `lib/metrics/db.ts`:
- Added `getDbSize()` function to calculate SQLite database file size
- Returns both raw bytes and formatted MB string
- Uses `fs.statSync()` on the database file path

### Changes to `lib/metrics/index.ts`:
- Exported `getDbSize` function for use in API routes

### Changes to `components/stats/StatsDashboard.tsx`:
- Added database size display in Overview section
- Shows "Database Size: X.XX MB" metric
- Includes TypeScript types for `dbStats` in overview data

### Changes to `components/stats/types.ts`:
- Added `DatabaseStats` interface with `sizeBytes` and `sizeMB` fields
- Extended `OverviewKPIs` response type to include optional `dbStats`

### New File: `docs/DOCKER_SETUP_EXPLAINED.md`:
- Comprehensive documentation explaining Docker setup
- Details on development vs production containers
- Explanation of volume mounts and permission handling
- Guidance on troubleshooting common Docker issues
- Architecture diagrams and workflow explanations

---

## 5. Minor Changes

### Commit 1916077: "Chore: renamed package to listmagify"
- Updated package name in `package.json` from old name to `listmagify`

### Commit c80d55d: "Chore: Added notes about Spotify API not supporting playlist folders"
- Updated `README.md` with note that Spotify API doesn't support folders
- Explains why all playlists are shown in flat list view

### Changes to `components/landing/LandingPageContent.tsx`:
- Minor adjustments (not documented in commits, likely formatting)

---

## Summary of File Changes

### New Files:
- `.github/workflows/docker-build.yml` - GitHub Actions workflow for Docker builds
- `components/stats/charts/UserGrowthChart.tsx` - User growth chart component
- `docs/DOCKER_SETUP_EXPLAINED.md` - Docker documentation

### Modified Files:
- `run.sh` - Enhanced with cache flags and registry pull support
- `run.bat` - Enhanced with cache flags and registry pull support
- `docker/docker-compose.prod.yml` - Changed to use ghcr.io images
- `README.md` - Added production deployment documentation
- `app/api/stats/overview/route.ts` - Added database size tracking
- `components/stats/StatsDashboard.tsx` - Layout and UX improvements
- `components/stats/cards/TrafficStatsCard.tsx` - Complete redesign
- `components/stats/cards/UserRegistrationChart.tsx` - Chart improvements
- `components/stats/components/KPICard.tsx` - Minor styling
- `components/stats/types.ts` - Added DatabaseStats types
- `lib/metrics/aggregations.ts` - Changed active users definition, added DB size
- `lib/metrics/db.ts` - Added getDbSize function
- `lib/metrics/index.ts` - Exported getDbSize
- `components/landing/LandingPageContent.tsx` - Minor updates

---

## How to Reintroduce These Changes

### 1. Start from baseline commit:
```bash
git checkout 3c3fdb93c1e3e63f53955d1fe7b9d2cfb71ee3a6
git checkout -b stats-fixes
```

### 2. Apply in this order:

**Stage 1: Docker & CI/CD Infrastructure**
1. Apply Docker cache improvements (run.sh, run.bat)
2. Create GitHub Actions workflow (.github/workflows/docker-build.yml)
3. Update docker-compose.prod.yml to use ghcr.io
4. Update README.md with production deployment docs
5. Test: Build and push image to registry

**Stage 2: Stats Backend Improvements**
1. Update lib/metrics/db.ts (add getDbSize)
2. Update lib/metrics/index.ts (export getDbSize)
3. Update lib/metrics/aggregations.ts (change active users definition)
4. Update app/api/stats/overview/route.ts (return DB size)
5. Test: API returns correct data

**Stage 3: Stats Frontend Improvements**
1. Update components/stats/types.ts (add DatabaseStats)
2. Create components/stats/charts/UserGrowthChart.tsx
3. Update components/stats/cards/TrafficStatsCard.tsx (redesign)
4. Update components/stats/cards/UserRegistrationChart.tsx (improvements)
5. Update components/stats/StatsDashboard.tsx (layout improvements)
6. Update components/stats/components/KPICard.tsx (styling)
7. Create docs/DOCKER_SETUP_EXPLAINED.md
8. Test: Stats page displays correctly

### 3. Skip/Modify:
- Do NOT apply any React Query refactoring changes (those caused the issues)
- The changes above are all safe and tested

---

## Key Takeaways

**What Worked:**
- Docker build cache optimization (74f7fea) - major speed improvement
- GitHub Actions CI/CD pipeline (4bc3a48, 27d4bef) - reliable automation
- Stats page UI improvements (d04bad5) - better UX
- Active users definition (2233329) - more accurate metrics

**What Caused Issues:**
- React Query refactoring attempts (not in commits above)
- Those changes tried to fix stats page hanging but made it worse
- Root cause was likely not the queryKeys but something else

**Recommended Approach:**
1. Revert to baseline (3c3fdb93c1e3e63f53955d1fe7b9d2cfb71ee3a6)
2. Reapply the 8 commits above (they're all good)
3. Investigate stats page hanging issue separately with different approach
   - Check API response times
   - Look for memory leaks
   - Profile React renders
   - Check database query performance
