import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

import { resolveMongoConnectionUri } from '../../../lib/preconfiguredMongoUris';
import { getAdminSession } from '../../../src/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DatabasesRequest = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
};

function parseBody(body: Partial<DatabasesRequest>): DatabasesRequest {
  const mongoUri = typeof body.mongoUri === 'string' ? body.mongoUri.trim() : '';
  const preconfiguredMongoUriId =
    typeof body.preconfiguredMongoUriId === 'string' ? body.preconfiguredMongoUriId.trim() : '';

  return { mongoUri, preconfiguredMongoUriId };
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody = (await request.json()) as Partial<DatabasesRequest>;
    const { mongoUri, preconfiguredMongoUriId } = parseBody(requestBody);

    const resolved = resolveMongoConnectionUri(mongoUri, preconfiguredMongoUriId);

    if (!resolved.success) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const client = new MongoClient(resolved.uri);

    try {
      await client.connect();
      const adminDb = client.db().admin();
      const { databases } = await adminDb.listDatabases({ nameOnly: true });
      const databaseNames = (databases ?? [])
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b));

      return NextResponse.json({ databases: databaseNames });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to list databases:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to load databases',
        message
      },
      { status: 500 }
    );
  }
}
