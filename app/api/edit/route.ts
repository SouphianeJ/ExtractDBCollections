import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { getRandomDocuments, serializeDocuments } from '../../../lib/mongoHelpers';
import { getAdminSession } from '../../../src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 1;

type EditAction = 'sample' | 'insert';

type EditRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  action: EditAction;
  document?: unknown;
};

type ParsedRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  action: EditAction;
  document?: unknown;
};

function parseBody(body: Partial<EditRequest>): ParsedRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const action = body.action === 'insert' ? 'insert' : 'sample';
  const document = body.document;

  return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, action, document };
}

function validateDocument(document: unknown) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Document payload must be a JSON object.');
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<EditRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, action, document } =
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

      if (action === 'sample') {
        const documents = await getRandomDocuments(db, collectionName, SAMPLE_LIMIT);
        const [sample] = serializeDocuments(documents);
        return NextResponse.json({ sample: sample ?? null });
      }

      validateDocument(document);
      const result = await collection.insertOne(document as Record<string, unknown>);
      return NextResponse.json({ success: result.acknowledged, insertedId: result.insertedId });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to handle edit request:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to process the edit request',
        message
      },
      { status: 500 }
    );
  }
}
