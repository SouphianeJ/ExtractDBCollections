import { NextResponse } from 'next/server';
import { MongoClient, Db } from 'mongodb';
import archiver from 'archiver';
import { PassThrough } from 'stream';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExtractionRequest = {
  mongoUri: string;
  databaseName: string;
  collectionName: string;
  limitTo3: boolean;
  allCollections: boolean;
  preconfiguredMongoUriId: string;
};

type DocumentData = {
  collectionName: string;
  documents: unknown[];
};

async function getRandomDocuments(db: Db, collectionName: string, limit: number) {
  const collection = db.collection(collectionName);
  const count = await collection.countDocuments();

  if (count === 0) {
    return [];
  }

  if (count <= limit) {
    return collection.find({}).toArray();
  }

  return collection.aggregate([{ $sample: { size: limit } }]).toArray();
}

async function extractFromCollection(db: Db, collectionName: string, limitTo3: boolean): Promise<DocumentData> {
  const documents = limitTo3
    ? await getRandomDocuments(db, collectionName, 3)
    : await db.collection(collectionName).find({}).toArray();

  return {
    collectionName,
    documents
  };
}

async function createZip(results: DocumentData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();
    const chunks: Buffer[] = [];

    passThrough.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    passThrough.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    passThrough.on('error', (error) => {
      reject(error);
    });

    archive.on('warning', (warning) => {
      const warn = warning as NodeJS.ErrnoException;
      if (warn.code === 'ENOENT') {
        console.warn('Archiver warning:', warn.message);
        return;
      }
      reject(warning);
    });

    archive.on('error', (error) => {
      reject(error);
    });

    archive.pipe(passThrough);

    for (const result of results) {
      const jsonContent = JSON.stringify(result.documents, null, 2);
      archive.append(jsonContent, { name: `${result.collectionName}.json` });
    }

    archive
      .finalize()
      .catch((error) => {
        reject(error);
      });
  });
}

function parseBody(body: Partial<ExtractionRequest>): ExtractionRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const databaseName = typeof body.databaseName === 'string' ? body.databaseName.trim() : '';
  const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : '';
  const limitTo3 = Boolean(body.limitTo3);
  const allCollections = Boolean(body.allCollections);
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';

  return {
    mongoUri,
    databaseName,
    collectionName,
    limitTo3,
    allCollections,
    preconfiguredMongoUriId
  };
}

export async function POST(request: Request) {
  try {
    const requestBody = (await request.json()) as Partial<ExtractionRequest>;
    const { mongoUri, databaseName, collectionName, limitTo3, allCollections, preconfiguredMongoUriId } =
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
        { error: 'Collection name is required when not extracting all collections' },
        { status: 400 }
      );
    }

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const db = client.db(databaseName);
      const results: DocumentData[] = [];

      if (allCollections) {
        const collections = await db.listCollections().toArray();

        for (const { name } of collections) {
          if (!name) {
            continue;
          }
          const data = await extractFromCollection(db, name, limitTo3);
          results.push(data);
        }
      } else {
        const data = await extractFromCollection(db, collectionName, limitTo3);
        results.push(data);
      }

      if (results.length === 1) {
        const [result] = results;
        const headers = new Headers({
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.collectionName)}.json"`
        });

        return new NextResponse(JSON.stringify(result.documents, null, 2), {
          status: 200,
          headers
        });
      }

      const zipBuffer = await createZip(results);
      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="collections.zip"'
      });

      const zipData = new Uint8Array(zipBuffer);

      return new NextResponse(zipData, {
        status: 200,
        headers
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error extracting data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to extract data',
        message
      },
      { status: 500 }
    );
  }
}
