import { Db } from 'mongodb';

export async function getRandomDocuments(db: Db, collectionName: string, limit: number) {
  const collection = db.collection(collectionName);
  const count = await collection.countDocuments();

  if (count === 0) {
    return [] as unknown[];
  }

  if (count <= limit) {
    return collection.find({}).toArray();
  }

  return collection.aggregate([{ $sample: { size: limit } }]).toArray();
}

export function serializeDocuments<T>(documents: T[]): T[] {
  return documents.map((document) => JSON.parse(JSON.stringify(document)) as T);
}
