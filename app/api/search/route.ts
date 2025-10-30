import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { serializeDocuments } from '../../../lib/mongoHelpers';
import { getAdminSession } from '../../../src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEARCH_LIMIT = 10;

type SearchMode = 'json' | 'text';

type SearchRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  query: string;
  text: string;
  mode: SearchMode;
};

function parseBody(body: Partial<SearchRequest>): SearchRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const rawMode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
  const mode: SearchMode = rawMode === 'text' ? 'text' : 'json';

  return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, query, text, mode };
}

function parseQuery(query: string): Record<string, unknown> {
  if (!query) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(query);
  } catch (error) {
    throw new Error('Search filter must be valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Search filter must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function buildContainsFilter(text: string): Record<string, unknown> {
  const normalized = text.toLowerCase();
  const serialized = JSON.stringify(normalized);

  return {
    $where: `function() {
      const needle = ${serialized};
      if (!needle) {
        return false;
      }

      try {
        const json = JSON.stringify(this);
        return typeof json === 'string' && json.toLowerCase().includes(needle);
      } catch (error) {
        return false;
      }
    }`
  };
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<SearchRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, query, text, mode } =
      parseBody(requestBody);

    const resolved = resolveMongoConnectionUri(mongoUri, preconfiguredMongoUriId);

    if (!resolved.success) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!databaseName) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 });
    }

    if (!collectionName) {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
    }

    let filter: Record<string, unknown>;

    if (mode === 'text') {
      if (!text) {
        return NextResponse.json({ error: 'Search text is required for text mode.' }, { status: 400 });
      }

      filter = buildContainsFilter(text);
    } else {
      try {
        filter = parseQuery(query);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid search filter';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const db = client.db(databaseName);
      const collection = db.collection(collectionName);
      const documents = await collection.find(filter).limit(SEARCH_LIMIT).toArray();

      return NextResponse.json({ documents: serializeDocuments(documents) });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to execute search query:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to execute search',
        message
      },
      { status: 500 }
    );
  }
}
