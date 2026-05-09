import { NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

import { executeDocumentSearch } from '../../../lib/documentSearch';
import { serializeDocuments } from '../../../lib/mongoHelpers';
import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { getAdminSession } from '../../../src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEARCH_LIMIT = 10;

type CrudAction = 'search' | 'create' | 'update' | 'delete';

type CrudRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  action: CrudAction;
  query?: string;
  document?: unknown;
  documentId?: unknown;
};

type ParsedCrudRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  action: CrudAction;
  query: string;
  document?: unknown;
  documentId?: unknown;
};

function parseBody(body: Partial<CrudRequest>): ParsedCrudRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const action: CrudAction =
    body.action === 'create' || body.action === 'update' || body.action === 'delete' ? body.action : 'search';
  const query = typeof body.query === 'string' ? body.query.trim() : '';

  return {
    mongoUri,
    preconfiguredMongoUriId,
    databaseName,
    collectionName,
    action,
    query,
    document: body.document,
    documentId: body.documentId
  };
}

function validateDocument(document: unknown): asserts document is Record<string, unknown> {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Document payload must be a JSON object.');
  }
}

function buildDocumentIdFilter(documentId: unknown) {
  if (typeof documentId === 'string') {
    const trimmedId = documentId.trim();

    if (!trimmedId) {
      throw new Error('Document identifier is required.');
    }

    const candidates: Array<Record<string, unknown>> = [{ _id: trimmedId }];

    if (ObjectId.isValid(trimmedId)) {
      candidates.unshift({ _id: new ObjectId(trimmedId) });
    }

    return candidates.length === 1 ? candidates[0] : { $or: candidates };
  }

  if (typeof documentId === 'number' || typeof documentId === 'boolean') {
    return { _id: documentId };
  }

  if (documentId && typeof documentId === 'object' && !Array.isArray(documentId)) {
    return { _id: documentId };
  }

  throw new Error('Document identifier is required.');
}

function toComparableIdentifier(value: unknown): string {
  return JSON.stringify(serializeDocuments([value])[0]);
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<CrudRequest>;
    const { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, action, query, document, documentId } =
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

      if (action === 'search') {
        const result = await executeDocumentSearch(collection, query, SEARCH_LIMIT);

        return NextResponse.json({
          documents: serializeDocuments(result.documents),
          mode: result.mode
        });
      }

      if (action === 'create') {
        validateDocument(document);
        const result = await collection.insertOne(document);

        return NextResponse.json({
          success: result.acknowledged,
          insertedId: serializeDocuments([result.insertedId])[0]
        });
      }

      const filter = buildDocumentIdFilter(documentId);
      const existingDocument = await collection.findOne(filter);

      if (!existingDocument) {
        return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      }

      if (action === 'delete') {
        const result = await collection.deleteOne({ _id: existingDocument._id });

        return NextResponse.json({
          success: result.deletedCount === 1,
          deletedId: serializeDocuments([existingDocument._id])[0]
        });
      }

      validateDocument(document);

      if (
        Object.prototype.hasOwnProperty.call(document, '_id') &&
        toComparableIdentifier(document._id) !== toComparableIdentifier(existingDocument._id)
      ) {
        return NextResponse.json(
          { error: 'The document identifier cannot be changed.' },
          { status: 400 }
        );
      }

      const nextDocument = {
        ...document,
        _id: existingDocument._id
      };

      const result = await collection.replaceOne({ _id: existingDocument._id }, nextDocument);

      return NextResponse.json({
        success: result.acknowledged && result.matchedCount === 1,
        updatedId: serializeDocuments([existingDocument._id])[0]
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to handle CRUD request:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to process CRUD request',
        message
      },
      { status: 500 }
    );
  }
}
