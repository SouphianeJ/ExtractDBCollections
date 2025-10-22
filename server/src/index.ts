import express, { Request, Response } from 'express';
import { MongoClient, Db } from 'mongodb';
import cors from 'cors';
import archiver from 'archiver';
import { Readable } from 'stream';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

interface ExtractionRequest {
  mongoUri: string;
  collectionName: string;
  limitTo3: boolean;
  allCollections: boolean;
}

interface DocumentData {
  collectionName: string;
  documents: any[];
}

async function getRandomDocuments(db: Db, collectionName: string, limit: number): Promise<any[]> {
  const collection = db.collection(collectionName);
  const count = await collection.countDocuments();
  
  if (count === 0) {
    return [];
  }
  
  if (count <= limit) {
    return await collection.find({}).toArray();
  }
  
  // Get random documents
  return await collection.aggregate([
    { $sample: { size: limit } }
  ]).toArray();
}

async function extractFromCollection(
  db: Db,
  collectionName: string,
  limitTo3: boolean
): Promise<DocumentData> {
  const collection = db.collection(collectionName);
  let documents: any[];
  
  if (limitTo3) {
    documents = await getRandomDocuments(db, collectionName, 3);
  } else {
    documents = await collection.find({}).toArray();
  }
  
  return {
    collectionName,
    documents
  };
}

app.post('/api/extract', async (req: Request, res: Response): Promise<void> => {
  try {
    const { mongoUri, collectionName, limitTo3, allCollections }: ExtractionRequest = req.body;
    
    if (!mongoUri) {
      res.status(400).json({ error: 'MongoDB URI is required' });
      return;
    }
    
    if (!allCollections && !collectionName) {
      res.status(400).json({ error: 'Collection name is required when not extracting all collections' });
      return;
    }
    
    const client = new MongoClient(mongoUri);
    
    try {
      await client.connect();
      const db = client.db();
      
      const results: DocumentData[] = [];
      
      if (allCollections) {
        // Extract from all collections
        const collections = await db.listCollections().toArray();
        
        for (const collInfo of collections) {
          const data = await extractFromCollection(db, collInfo.name, limitTo3);
          results.push(data);
        }
      } else {
        // Extract from single collection
        const data = await extractFromCollection(db, collectionName, limitTo3);
        results.push(data);
      }
      
      // If single collection, return JSON directly
      if (results.length === 1) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${results[0].collectionName}.json"`);
        res.json(results[0].documents);
        return;
      }
      
      // Multiple collections - create ZIP
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="collections.zip"');
      
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.on('error', (err: Error) => {
        throw err;
      });
      
      archive.pipe(res);
      
      for (const result of results) {
        const jsonContent = JSON.stringify(result.documents, null, 2);
        archive.append(jsonContent, { name: `${result.collectionName}.json` });
      }
      
      await archive.finalize();
      
    } finally {
      await client.close();
    }
    
  } catch (error) {
    console.error('Error extracting data:', error);
    res.status(500).json({ 
      error: 'Failed to extract data', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
