import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { getRandomDocuments, serializeDocuments } from '../../../lib/mongoHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 3;

type ViewRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  allCollections: boolean;
};

type CollectionPreview = {
  name: string;
  documents: unknown[];
};

function parseBody(body: Partial<ViewRequest>): ViewRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const allCollections = Boolean(body.allCollections);

  return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, allCollections };
}

export async function POST(request: Request) {
  try {
    const requestBody = (await request.json()) as Partial<ViewRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, allCollections } =
      parseBody(requestBody);

    const resolved = resolveMongoConnectionUri(mongoUri, preconfiguredMongoUriId);

    if (!resolved.success) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!databaseName) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 });
    }

    if (!allCollections && !collectionName) {
      return NextResponse.json(
        { error: 'Collection name is required when not loading all collections' },
        { status: 400 }
      );
    }

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const db = client.db(databaseName);

      const previews: CollectionPreview[] = [];

      if (allCollections) {
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        const collectionNames = collections
          .map((collection) => collection.name)
          .filter((name): name is string => Boolean(name))
          .sort((a, b) => a.localeCompare(b));

        for (const name of collectionNames) {
          const documents = await getRandomDocuments(db, name, SAMPLE_LIMIT);
          previews.push({ name, documents: serializeDocuments(documents) });
        }
      } else if (collectionName) {
        const documents = await getRandomDocuments(db, collectionName, SAMPLE_LIMIT);
        previews.push({ name: collectionName, documents: serializeDocuments(documents) });
      }

      return NextResponse.json({ collections: previews });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to load collection previews:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to load collection previews',
        message
      },
      { status: 500 }
    );
  }
}
