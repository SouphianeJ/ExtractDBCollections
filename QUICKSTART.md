# Quick Start Guide

## Prerequisites
- Node.js v20+
- npm v10+
- MongoDB instance (local or remote)

## Install & Run

```bash
npm install
npm run dev
```

Visit the app at [http://localhost:3000](http://localhost:3000).

## Usage Examples

### Extract Single Collection (All Documents)
1. MongoDB URI: `mongodb://localhost:27017/mydb`
2. Collection Name: `users`
3. Extract only 3 documents: ⬜ (unchecked)
4. Extract all collections: ⬜ (unchecked)
5. Click "Extract & Download"
→ Downloads: `users.json`

### Extract Single Collection (3 Random Documents)
1. MongoDB URI: `mongodb://localhost:27017/mydb`
2. Collection Name: `users`
3. Extract only 3 documents: ✅ (checked)
4. Extract all collections: ⬜ (unchecked)
5. Click "Extract & Download"
→ Downloads: `users.json` (with 3 random documents)

### Extract All Collections (All Documents)
1. MongoDB URI: `mongodb://localhost:27017/mydb`
2. Collection Name: (disabled)
3. Extract only 3 documents: ⬜ (unchecked)
4. Extract all collections: ✅ (checked)
5. Click "Extract & Download"
→ Downloads: `collections.zip` (containing all collections as separate JSON files)

### Extract All Collections (3 Random Documents Each)
1. MongoDB URI: `mongodb://localhost:27017/mydb`
2. Collection Name: (disabled)
3. Extract only 3 documents: ✅ (checked)
4. Extract all collections: ✅ (checked)
5. Click "Extract & Download"
→ Downloads: `collections.zip` (each collection file has 3 random documents)

## API Endpoint

### POST /api/extract

**Request**
```json
{
  "mongoUri": "mongodb://localhost:27017/mydb",
  "collectionName": "users",
  "limitTo3": false,
  "allCollections": false
}
```

**Response**
- Single collection: JSON download
- Multiple collections: ZIP download

## Production Build

```bash
npm run build
npm start
```

## Troubleshooting

**Cannot connect to MongoDB**
- Ensure MongoDB is running and reachable
- Verify the connection string

**Download issues**
- Check terminal output for errors from `/api/extract`

**Port already in use**
- Set the `PORT` environment variable before running `npm run dev` or `npm start`
