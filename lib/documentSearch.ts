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

export type SearchExecutionResult = {
  documents: unknown[];
  mode: ParsedSearchQuery['mode'];
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

  const searchTerms = Array.from(
    new Map(
      trimmedQuery
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, MAX_TEXT_SEARCH_TERMS)
        .map((term) => [term.toLowerCase(), term] as const)
    ).values()
  );

  return {
    mode: 'text',
    rawQuery: trimmedQuery,
    searchTerm: trimmedQuery,
    searchTerms
  };
}

export async function executeDocumentSearch(
  collection: Collection,
  rawQuery: string,
  limit: number
): Promise<SearchExecutionResult> {
  const parsedQuery = parseSearchQuery(rawQuery);

  if (parsedQuery.mode === 'json') {
    const documents = await collection.find(parsedQuery.filter).limit(limit).toArray();
    return {
      documents,
      mode: parsedQuery.mode
    };
  }

  const fieldPaths = await discoverSearchablePaths(collection);

  if (!fieldPaths.length) {
    return {
      documents: [],
      mode: parsedQuery.mode
    };
  }

  const searchTerms = parsedQuery.searchTerms.length ? parsedQuery.searchTerms : [parsedQuery.searchTerm];
  const expressions = searchTerms.map((searchTerm) => {
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
  });

  const documents = await collection
    .aggregate([
      {
        $match: {
          $expr: {
            $and: expressions
          }
        }
      },
      {
        $limit: limit
      }
    ])
    .toArray();

  return {
    documents,
    mode: parsedQuery.mode
  };
}
