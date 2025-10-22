# MongoDB Collection Extractor

A full-stack application built with Angular (frontend) and Node.js/Express (backend) that allows you to extract collections from MongoDB and download them as JSON files.

## Features

- **MongoDB URI Connection**: Connect to any MongoDB database using a URI
- **Single Collection Extraction**: Extract documents from a specific collection
- **All Collections Extraction**: Extract documents from all collections in the database
- **Limit Mode**: Extract only 3 random documents per collection
- **Full Extraction**: Extract all documents from collections
- **Smart Download**:
  - Single collection → JSON file
  - Multiple collections → ZIP file containing multiple JSON files

## Project Structure

```
ExtractDBCollections/
├── extract-db-app/          # Angular frontend application
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.ts       # Main component with form logic
│   │   │   ├── app.html     # Form template
│   │   │   └── app.css      # Component styles
│   │   └── styles.css       # Global styles
│   └── package.json
│
└── server/                   # Node.js/Express backend
    ├── src/
    │   └── index.ts         # Server with MongoDB extraction logic
    ├── tsconfig.json        # TypeScript configuration (strict mode)
    └── package.json
```

## Prerequisites

- Node.js (v20 or higher)
- npm (v10 or higher)
- MongoDB instance accessible via URI

## Installation

### 1. Install Frontend Dependencies

```bash
cd extract-db-app
npm install
```

### 2. Install Backend Dependencies

```bash
cd ../server
npm install
```

## Running the Application

### 1. Start the Backend Server

```bash
cd server
npm run dev
```

The server will start on `http://localhost:3000`

### 2. Start the Frontend Application

In a new terminal:

```bash
cd extract-db-app
npm start
```

The Angular app will start on `http://localhost:4200`

## Usage

1. Open your browser and navigate to `http://localhost:4200`
2. Fill in the form:
   - **MongoDB URI**: e.g., `mongodb://localhost:27017/mydb`
   - **Collection Name**: e.g., `users` (disabled when "Extract all collections" is checked)
   - **Extract only 3 documents**: Check to limit extraction to 3 random documents
   - **Extract all collections**: Check to extract from all collections in the database
3. Click "Extract & Download" to start the extraction
4. The file(s) will be downloaded automatically

## API Endpoints

### POST /api/extract

Extracts data from MongoDB based on the provided parameters.

**Request Body:**
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

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## TypeScript Strict Mode

Both frontend and backend are configured with TypeScript strict mode enabled:

**Frontend** (`extract-db-app/tsconfig.json`):
- `strict: true`
- `strictTemplates: true`
- Additional strict options enabled

**Backend** (`server/tsconfig.json`):
- `strict: true`
- Full type safety enforced

## Building for Production

### Frontend

```bash
cd extract-db-app
npm run build
```

Build output will be in `extract-db-app/dist/extract-db-app`

### Backend

```bash
cd server
npm run build
```

Build output will be in `server/dist`

## Security Considerations

- Never expose MongoDB credentials in the frontend
- Use environment variables for sensitive configuration
- Implement proper authentication and authorization in production
- Validate and sanitize all user inputs
- Use secure MongoDB connection strings (TLS/SSL)

## License

ISC
