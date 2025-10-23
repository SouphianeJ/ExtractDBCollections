import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CollectionsRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
};

function parseBody(body: Partial<CollectionsRequest>): CollectionsRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';

  return { mongoUri, preconfiguredMongoUriId, databaseName };
}

export async function POST(request: Request) {
  try {
    const requestBody = (await request.json()) as Partial<CollectionsRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName } = parseBody(requestBody);

    const resolved = resolveMongoConnectionUri(mongoUri, preconfiguredMongoUriId);

    if (!resolved.success) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!databaseName) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 });
    }

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const db = client.db(databaseName);
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      const collectionNames = collections
        .map((collection) => collection.name)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b));

      return NextResponse.json({ collections: collectionNames });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to list collections:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to load collections',
        message
      },
      { status: 500 }
    );
  }
}
