# Quick Start Guide

## Prerequisites
- Node.js v20+
- npm v10+
- MongoDB instance

## Installation & Running

### 1. Backend Server
```bash
cd server
npm install
npm run dev
```
Server runs on: http://localhost:3000

### 2. Frontend App
```bash
cd extract-db-app
npm install
npm start
```
App runs on: http://localhost:4200

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

**Request:**
```json
{
  "mongoUri": "mongodb://localhost:27017/mydb",
  "collectionName": "users",
  "limitTo3": false,
  "allCollections": false
}
```

**Response:**
- Single collection: JSON file
- Multiple collections: ZIP file

## Development

### Build Frontend
```bash
cd extract-db-app
npm run build
```

### Build Backend
```bash
cd server
npm run build
```

### TypeScript Strict Mode
Both projects use strict TypeScript configuration for type safety.

## Troubleshooting

**Cannot connect to MongoDB:**
- Ensure MongoDB is running
- Check the MongoDB URI format
- Verify network access to MongoDB

**Port already in use:**
- Backend: Change PORT in server/.env
- Frontend: Change port in angular.json

**CORS errors:**
- Backend has CORS enabled by default
- Check that backend is running on port 3000
