import { NextResponse } from 'next/server';
import { MongoClient, type Document } from 'mongodb';

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
  searchTerm: string;
};

type SearchResponse = {
  documents: unknown[];
};

function parseBody(body: Partial<SearchRequest>): SearchRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const searchTerm = typeof body.searchTerm === 'string' ? body.searchTerm.trim() : '';

  return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, searchTerm };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<SearchRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, searchTerm } = parseBody(requestBody);

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

      const pipeline: Document[] = [];

      if (searchTerm) {
        pipeline.push({
          $match: {
            $expr: {
              $regexMatch: {
                input: { $toString: '$$ROOT' },
                regex: escapeRegex(searchTerm),
                options: 'i'
              }
            }
          }
        });
      }

      pipeline.push({ $limit: SEARCH_LIMIT });

      const documents = await collection.aggregate(pipeline, { allowDiskUse: false }).toArray();
      const serialized = serializeDocuments(documents);

      const response: SearchResponse = { documents: serialized };
      return NextResponse.json(response);
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to search documents:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to search documents',
        message
      },
      { status: 500 }
    );
  }
}
