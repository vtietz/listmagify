# Recommendation System

The recommendation system provides personalized track suggestions based on your playlist organization patterns. It learns from how you arrange tracks and suggests similar songs you might want to add.

## Overview

The system uses a **graph-based approach** where tracks are nodes and relationships between them are edges. When you load or modify playlists, the system captures patterns about which tracks appear together and in what order.

### Key Concepts

- **Track Graph**: A network where each track is connected to other tracks based on co-occurrence and sequential patterns
- **Edge Weights**: Connections have weights that indicate relationship strength, decaying over time to prioritize recent patterns
- **Multi-Signal Scoring**: Recommendations blend adjacency and co-occurrence signals for quality suggestions

## How It Works

### 1. Data Collection

When you open playlists in the split editor, the system captures:

- **Sequential Adjacency**: Which tracks follow each other (track A → track B)
- **Co-occurrence**: Which tracks appear in the same playlists within a sliding window
- **Playlist Snapshots**: Point-in-time captures of playlist composition

**Liked Songs** are also captured, but only for co-occurrence (not adjacency) since their order is reverse-chronological rather than user-curated. This means your liked tracks contribute to taste-based signals without polluting sequential patterns.

This data is stored locally in a SQLite database - nothing is sent externally.

### 2. Recommendation Modes

**Mode A: Seed-Based Recommendations**
- Select 1-5 tracks in the split editor
- System finds tracks frequently appearing near your selection
- Best for "find me tracks similar to these"

**Mode B: Playlist Appendix Recommendations**
- Based on entire playlist composition
- Emphasizes tracks that would flow well at the end
- Best for "what should I add to this playlist?"

### 2. Scoring

Each candidate track receives a blended score from multiple signals:

| Signal | Weight | Description |
|--------|--------|-------------|
| Sequential Adjacency | 60% | Tracks that follow your seeds in other playlists |
| Co-occurrence | 30% | Tracks appearing in same playlists as your seeds |
| Recency | 5% | Bonus for recently added relationships |

Scores are normalized and combined. Tracks appearing in multiple signals receive a diversity bonus.

## User Interface

Recommendations appear in the **Browse panel** (right side of split editor) when you select tracks:

1. Select one or more tracks in any playlist panel
2. The recommendations panel appears at the bottom of the Browse panel
3. Click to expand/collapse the recommendations list
4. Drag recommended tracks into your playlists
5. Dismiss unwanted recommendations with the X button

Dismissals are remembered per-playlist context, so you won't see the same unwanted suggestions repeatedly.

## Data Management

### Storage

All data is stored locally:
- **Database**: SQLite file at the configured path (default: `./data/recs.db`)
- **Size**: Typically 10-50 MB depending on library size
- **Privacy**: No data leaves your server; purely local learning

### Maintenance

The system includes automatic maintenance tasks:

- **Edge Decay**: Older relationships gradually lose weight (handled via scoring)
- **Snapshot Pruning**: Old playlist snapshots are naturally superseded by new captures

## Configuration

Enable the system by setting `RECS_ENABLED=true` in your `.env` file. See `.env.example` for all available options.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RECS_ENABLED` | `false` | Master toggle for the system |
| `RECS_DB_PATH` | `./data/recs.db` | Database file location |

Other parameters (decay factor, edge limits, scoring weights) are internal constants optimized for typical usage and not exposed as environment variables.

## Architecture

### Database Schema

The system uses several interconnected tables:

- **tracks**: Cached track metadata
- **playlist_tracks**: Point-in-time playlist snapshots
- **track_edges_seq**: Sequential adjacency relationships
- **track_cooccurrence**: Co-occurrence relationships
- **dismissed_recommendations**: User dismissals per context

### API Endpoints

- `POST /api/recs/seed` - Get seed-based recommendations
- `POST /api/recs/playlist-appendix` - Get playlist completion suggestions
- `POST /api/recs/capture` - Capture playlist snapshot
- `POST /api/recs/dismiss` - Dismiss a recommendation
- `DELETE /api/recs/dismiss` - Clear dismissals

### Performance

- Recommendations are computed synchronously (sub-100ms for typical queries)
- Edge lookups use indexed SQLite queries
- Scoring happens in-memory after candidate retrieval
- Database uses WAL mode for concurrent read performance

## Limitations

- Requires playlist interaction to build the graph (cold start)
- Quality improves with more playlist data
- Only considers tracks you've encountered in playlists
- Cannot recommend completely unknown tracks (use Spotify search for that)

## Future Improvements

Potential enhancements (not yet implemented):

- User-defined tags for folksonomy-based recommendations
- Audio feature similarity using Spotify's audio analysis
- Collaborative filtering across users (requires consent)
- Genre-based clustering and recommendations
