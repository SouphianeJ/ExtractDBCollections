import type { Collection } from 'mongodb';

type JsonSearchQuery = {
  mode: 'json';
  rawQuery: string;
  filter: Record<string, unknown>;
};

type TextSearchQuery = {
  mode: 'text';
  rawQuery: string;
  searchTerm: string;
  searchTerms: string[];
};

export type ParsedSearchQuery = JsonSearchQuery | TextSearchQuery;

export type DocumentSearchOptions = {
  query: string;
  excludeQuery?: string;
  limit: number;
  offset?: number;
};

export type SearchExecutionResult = {
  documents: unknown[];
  mode: ParsedSearchQuery['mode'];
  limit: number;
  offset: number;
  hasMore: boolean;
};

const FIELD_DISCOVERY_LIMIT = 50;
const MAX_DISCOVERED_FIELD_PATHS = 200;
const MAX_DISCOVERY_DEPTH = 6;
const ARRAY_DISCOVERY_LIMIT = 5;
const MAX_TEXT_SEARCH_TERMS = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTextSearchTerms(rawQuery: string): string[] {
  return Array.from(
    new Map(
      rawQuery
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, MAX_TEXT_SEARCH_TERMS)
        .map((term) => [term.toLowerCase(), term] as const)
    ).values()
  );
}

function collectSearchablePaths(
  value: unknown,
  currentPath: string,
  paths: Set<string>,
  depth: number
) {
  if (!currentPath && !isPlainObject(value) && !Array.isArray(value)) {
    return;
  }

  if (depth >= MAX_DISCOVERY_DEPTH) {
    if (currentPath) {
      paths.add(currentPath);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (currentPath) {
      paths.add(currentPath);
    }

    for (const entry of value.slice(0, ARRAY_DISCOVERY_LIMIT)) {
      collectSearchablePaths(entry, currentPath, paths, depth + 1);
      if (paths.size >= MAX_DISCOVERED_FIELD_PATHS) {
        return;
      }
    }

    return;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (!entries.length && currentPath) {
      paths.add(currentPath);
      return;
    }

    for (const [key, nestedValue] of entries) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      collectSearchablePaths(nestedValue, nextPath, paths, depth + 1);
      if (paths.size >= MAX_DISCOVERED_FIELD_PATHS) {
        return;
      }
    }

    return;
  }

  if (currentPath) {
    paths.add(currentPath);
  }
}

async function discoverSearchablePaths(collection: Collection): Promise<string[]> {
  const samples = await collection.find({}).limit(FIELD_DISCOVERY_LIMIT).toArray();
  const paths = new Set<string>(['_id']);

  for (const sample of samples) {
    collectSearchablePaths(sample, '', paths, 0);
    if (paths.size >= MAX_DISCOVERED_FIELD_PATHS) {
      break;
    }
  }

  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const trimmedQuery = rawQuery.trim();

  if (!trimmedQuery) {
    return {
      mode: 'json',
      rawQuery: '',
      filter: {}
    };
  }

  try {
    const parsed = JSON.parse(trimmedQuery);

    if (isPlainObject(parsed)) {
      return {
        mode: 'json',
        rawQuery: trimmedQuery,
        filter: parsed
      };
    }
  } catch {}

  const searchTerms = parseTextSearchTerms(trimmedQuery);

  return {
    mode: 'text',
    rawQuery: trimmedQuery,
    searchTerm: trimmedQuery,
    searchTerms
  };
}

function buildTermExpression(fieldPaths: string[], searchTerm: string) {
  const regex = escapeRegExp(searchTerm);

  return {
    $or: fieldPaths.map((fieldPath) => ({
      $regexMatch: {
        input: {
          $convert: {
            input: `$${fieldPath}`,
            to: 'string',
            onError: '',
            onNull: ''
          }
        },
        regex,
        options: 'i'
      }
    }))
  };
}

export async function executeDocumentSearch(
  collection: Collection,
  { query, excludeQuery = '', limit, offset = 0 }: DocumentSearchOptions
): Promise<SearchExecutionResult> {
  const parsedQuery = parseSearchQuery(query);
  const excludeTerms = parseTextSearchTerms(excludeQuery);
  const normalizedOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const responseMode =
    parsedQuery.mode === 'json' && !parsedQuery.rawQuery && excludeTerms.length > 0 ? 'text' : parsedQuery.mode;

  if (parsedQuery.mode === 'json' && !excludeTerms.length) {
    const pagedDocuments = await collection
      .find(parsedQuery.filter)
      .skip(normalizedOffset)
      .limit(limit + 1)
      .toArray();

    return {
      documents: pagedDocuments.slice(0, limit),
      mode: responseMode,
      limit,
      offset: normalizedOffset,
      hasMore: pagedDocuments.length > limit
    };
  }

  const fieldPaths = await discoverSearchablePaths(collection);

  if (!fieldPaths.length) {
    return {
      documents: [],
      mode: responseMode,
      limit,
      offset: normalizedOffset,
      hasMore: false
    };
  }

  const expressions: Record<string, unknown>[] = [];

  if (parsedQuery.mode === 'text') {
    const searchTerms = parsedQuery.searchTerms.length ? parsedQuery.searchTerms : [parsedQuery.searchTerm];

    if (searchTerms.length) {
      expressions.push({
        $and: searchTerms.map((searchTerm) => buildTermExpression(fieldPaths, searchTerm))
      });
    }
  }

  for (const excludeTerm of excludeTerms) {
    expressions.push({
      $not: buildTermExpression(fieldPaths, excludeTerm)
    });
  }

  const pipeline: Record<string, unknown>[] = [];

  if (parsedQuery.mode === 'json') {
    pipeline.push({ $match: parsedQuery.filter });
  }

  if (expressions.length) {
    pipeline.push({
      $match: {
        $expr:
          expressions.length === 1
            ? expressions[0]
            : {
                $and: expressions
              }
      }
    });
  }

  pipeline.push({ $skip: normalizedOffset });
  pipeline.push({ $limit: limit + 1 });

  const pagedDocuments = await collection.aggregate(pipeline).toArray();

  return {
    documents: pagedDocuments.slice(0, limit),
    mode: responseMode,
    limit,
    offset: normalizedOffset,
    hasMore: pagedDocuments.length > limit
  };
}
