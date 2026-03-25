import { ProviderApiError } from '@/lib/music-provider/types';

export type JsonApiIdentifier = {
  id: string;
  type: string;
  meta?: {
    itemId?: string;
    addedAt?: string;
  };
};

export type JsonApiRelationship = {
  data?: JsonApiIdentifier | JsonApiIdentifier[] | null;
};

export type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Record<string, JsonApiRelationship>;
};

export type JsonApiDocument<TData = unknown> = {
  data: TData;
  included?: JsonApiResource[];
  links?: {
    self?: string;
    next?: string | null;
  };
};

export type PlaylistItemReference = {
  id: string;
  type: string;
  itemId?: string;
  addedAt?: string;
};

export const JSON_API_CONTENT_TYPE = 'application/vnd.api+json';
export const MAX_BATCH_SIZE = 100;

export function toTrackUri(trackId: string): string {
  return `tidal:track:${trackId}`;
}

export function fromTrackUri(value: string): string {
  if (value.startsWith('tidal:track:')) {
    return value.slice('tidal:track:'.length);
  }

  return value;
}

export function dedupeTrackIds(input: string[]): string[] {
  const unique = new Set<string>();
  for (const value of input) {
    const id = fromTrackUri(value);
    if (!id) {
      continue;
    }

    unique.add(id);
  }

  return Array.from(unique);
}

export function buildJsonApiDataPayload(data: JsonApiIdentifier[]): string {
  return JSON.stringify({ data });
}

export function extractJsonApiErrorDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  const topLevelDetail = asRecord.detail;
  if (typeof topLevelDetail === 'string' && topLevelDetail.trim().length > 0) {
    return topLevelDetail.trim();
  }

  const errors = asRecord.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const detail = (entry as Record<string, unknown>).detail;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail.trim();
      }
    }
  }

  return null;
}

export async function readJsonApiErrorDetails(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('json')) {
    try {
      const json = await response.json();
      const detail = extractJsonApiErrorDetail(json);
      if (detail) {
        return detail;
      }

      return JSON.stringify(json);
    } catch {
      // Fall back to text body below.
    }
  }

  return response.text().catch(() => '');
}

type ReorderableReference = {
  id: string;
  type: 'tracks' | 'videos';
  itemId: string;
};

function toReorderableReference(reference: { id: string; type: string; itemId?: string }, providerId: 'tidal'): ReorderableReference {
  const normalizedType = reference.type === 'videos' ? 'videos' : 'tracks';
  if (typeof reference.itemId !== 'string' || reference.itemId.length === 0) {
    throw new ProviderApiError('reorderTracks failed: missing TIDAL itemId', 400, providerId);
  }

  return {
    id: reference.id,
    type: normalizedType,
    itemId: reference.itemId,
  };
}

export function buildNativeReorderPayload(
  allReferences: Array<{ id: string; type: string; itemId?: string }>,
  fromIndex: number,
  toIndex: number,
  rangeLength: number,
  providerId: 'tidal',
): {
  payload: {
    data: Array<{ id: string; type: 'tracks' | 'videos'; meta: { itemId: string } }>;
    meta: { positionBefore: string | null };
  };
  movedItemIds: string[];
  anchorItemId: string | null;
} {
  const moved = allReferences.slice(fromIndex, fromIndex + rangeLength).map((reference) => toReorderableReference(reference, providerId));
  if (moved.length === 0) {
    return {
      payload: {
        data: [],
        meta: { positionBefore: null },
      },
      movedItemIds: [],
      anchorItemId: null,
    };
  }

  const remaining = allReferences
    .filter((_, index) => index < fromIndex || index >= fromIndex + rangeLength)
    .map((reference) => toReorderableReference(reference, providerId));

  const effectiveTarget = toIndex > fromIndex ? toIndex - moved.length : toIndex;
  const anchorItemId = effectiveTarget < remaining.length ? remaining[effectiveTarget]!.itemId : null;

  return {
    payload: {
      data: moved.map((reference) => ({
        id: reference.id,
        type: reference.type,
        meta: { itemId: reference.itemId },
      })),
      meta: { positionBefore: anchorItemId },
    },
    movedItemIds: moved.map((reference) => reference.itemId),
    anchorItemId,
  };
}

export function applyReorderToTrackUris(
  allReferences: Array<{ id: string; type: string }>,
  fromIndex: number,
  toIndex: number,
  rangeLength: number,
  providerId: 'tidal',
): string[] {
  if (allReferences.some((reference) => reference.type !== 'tracks')) {
    throw new ProviderApiError('reorderTracks failed: fallback supports track items only', 501, providerId);
  }

  const trackUris = allReferences.map((reference) => toTrackUri(reference.id));
  const moved = trackUris.slice(fromIndex, fromIndex + rangeLength);
  if (moved.length === 0) {
    return trackUris;
  }

  const remaining = trackUris.filter((_, index) => index < fromIndex || index >= fromIndex + rangeLength);
  const effectiveTarget = toIndex > fromIndex ? toIndex - moved.length : toIndex;
  remaining.splice(effectiveTarget, 0, ...moved);
  return remaining;
}

function toIdentifierArray(relationship?: JsonApiRelationship): JsonApiIdentifier[] {
  const relationData = relationship?.data;
  if (!relationData) {
    return [];
  }

  return Array.isArray(relationData) ? relationData : [relationData];
}

export function buildIncludedIndex(included: JsonApiResource[] | undefined): Map<string, JsonApiResource> {
  const index = new Map<string, JsonApiResource>();
  if (!included) {
    return index;
  }

  for (const resource of included) {
    index.set(`${resource.type}:${resource.id}`, resource);
  }

  return index;
}

export function getIncludedResource(
  index: Map<string, JsonApiResource>,
  identifier?: { id?: string; type?: string } | null,
): JsonApiResource | null {
  if (!identifier?.id || !identifier.type) {
    return null;
  }

  return index.get(`${identifier.type}:${identifier.id}`) ?? null;
}

export function getFirstRelationshipResource(
  resource: JsonApiResource,
  relationshipName: string,
  index: Map<string, JsonApiResource>,
): JsonApiResource | null {
  const identifiers = toIdentifierArray(resource.relationships?.[relationshipName]);
  const first = identifiers[0];
  if (!first) {
    return null;
  }

  return getIncludedResource(index, first);
}

export function toRelationArray(data: unknown): JsonApiIdentifier[] {
  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : [data as JsonApiIdentifier];
}
