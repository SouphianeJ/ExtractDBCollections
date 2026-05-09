import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { executeDocumentSearch } from '../../../lib/documentSearch';
import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { serializeDocuments } from '../../../lib/mongoHelpers';
import { getAdminSession } from '../../../src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEARCH_LIMIT = 10;

type SearchRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  query: string;
  excludeQuery: string;
  page: number;
};

function parseBody(body: Partial<SearchRequest>): SearchRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const excludeQuery = typeof body.excludeQuery === 'string' ? body.excludeQuery.trim() : '';
  const page = typeof body.page === 'number' && Number.isFinite(body.page) && body.page > 0 ? Math.floor(body.page) : 0;

  return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, query, excludeQuery, page };
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<SearchRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, query, excludeQuery, page } =
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

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const db = client.db(databaseName);
      const collection = db.collection(collectionName);
      const result = await executeDocumentSearch(collection, {
        query,
        excludeQuery,
        limit: SEARCH_LIMIT,
        offset: page * SEARCH_LIMIT
      });

      return NextResponse.json({
        documents: serializeDocuments(result.documents),
        mode: result.mode,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset
      });
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
