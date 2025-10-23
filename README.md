# MongoDB Collection Extractor

A full-stack application powered by **Next.js** that lets you extract MongoDB collections and download them as JSON (single collection) or ZIP archives (multiple collections). The UI and API live in the same project, eliminating the Angular + Express monorepo setup while keeping all existing functionality.

## Features

- **MongoDB URI Connection** – Connect to any MongoDB instance via connection string
- **Database & Collection Browsing** – Automatically discover databases and collections for the selected connection
- **Single Collection Extraction** – Download every document from a chosen collection
- **All Collections Extraction** – Export every collection from the connected database
- **Limit Mode** – Optionally grab only three random documents per collection
- **Smart Downloading**
  - Single collection → JSON file download
  - Multiple collections → ZIP archive containing one JSON file per collection

## Project Structure

```
ExtractDBCollections/
├── app/
│   ├── api/
│   │   ├── extract/route.ts   # API route that handles MongoDB extraction and file streaming
│   │   └── health/route.ts    # Lightweight health-check endpoint
│   ├── globals.css            # Global styles shared by the application
│   ├── layout.tsx             # Root layout definition
│   └── page.tsx               # Server component that wires preconfigured connections into the UI
├── components/
│   └── ExtractorForm.tsx      # Client component containing the interactive extraction form
├── lib/
│   └── preconfiguredMongoUris.ts # Helpers for reading preconfigured MongoDB URIs from the environment
├── next.config.mjs            # Next.js configuration
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration (strict mode)
└── README.md                  # Project documentation
```

## Prerequisites

- Node.js **v20** or newer
- npm **v10** or newer
- An accessible MongoDB instance and connection string

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

The application runs on [http://localhost:3000](http://localhost:3000). The UI and API share the same origin, so no extra proxy or CORS setup is required.

### Environment configuration

Create a `.env` file at the project root to define up to four reusable MongoDB connections. Each connection requires a URI and a friendly name that appears in the selector:

```
MONGODB_URI1="mongodb://localhost:27017/mydb"
MONGODB_URI1_NAME="Local MongoDB"

MONGODB_URI2=""
MONGODB_URI2_NAME=""

MONGODB_URI3=""
MONGODB_URI3_NAME=""

MONGODB_URI4=""
MONGODB_URI4_NAME=""
```

Only pairs with both values populated appear in the dropdown. Select **Enter custom MongoDB URI** if you prefer to supply a one-off connection string.

## Usage

1. Open the app at `http://localhost:3000`.
2. Choose a preconfigured connection from the dropdown or select **Enter custom MongoDB URI** to provide your own string.
3. Once the connection is available, pick a database from the **Database** dropdown (the app fetches the list automatically).
4. Select a collection from the **Collection** dropdown, or enable *Extract all collections* to export every collection in the database.
5. Toggle **Extract only 3 random documents** if you want a sample instead of the full dataset.
6. Click **Extract & Download** to receive either a JSON file (single collection) or a ZIP archive (multiple collections).

## API Endpoints

### `POST /api/extract`

Extracts data from MongoDB based on the submitted payload.

**Request body**

```json
{
  "preconfiguredMongoUriId": "preconfigured-1",
  "mongoUri": "", // Provide when using a custom connection
  "databaseName": "sample_mflix",
  "collectionName": "users",
  "limitTo3": false,
  "allCollections": false
}
```

**Responses**

- **200 JSON** – Single collection export (attachment with `<collection>.json`)
- **200 ZIP** – Multiple collection export (attachment with `collections.zip`)
- **400 JSON** – Validation error (missing URI, database, or collection)
- **500 JSON** – Extraction failure details

### `POST /api/databases`

Returns the list of database names available for the supplied MongoDB connection.

**Request body**

```json
{
  "preconfiguredMongoUriId": "preconfigured-1",
  "mongoUri": "" // Provide when using a custom connection
}
```

**Response**

```json
{
  "databases": ["admin", "sample_mflix"]
}
```

### `POST /api/collections`

Lists the collections inside the selected database for the active connection.

**Request body**

```json
{
  "preconfiguredMongoUriId": "preconfigured-1",
  "mongoUri": "", // Provide when using a custom connection
  "databaseName": "sample_mflix"
}
```

**Response**

```json
{
  "collections": ["users", "orders"]
}
```

### `GET /api/health`

Simple health-check endpoint returning:

```json
{ "status": "ok" }
```

## Production Build

Create an optimized production build and start the server:

```bash
npm run build
npm start
```

## Security Notes

- Never expose MongoDB credentials publicly. Prefer environment variables or secret managers.
- Restrict access to this tool in production environments.
- Validate user input and enforce authentication/authorization where appropriate.

## Troubleshooting

- **Connection issues** – Ensure the MongoDB URI is correct and the database is reachable from your environment.
- **Download fails** – Check server logs for detailed error messages returned by `/api/extract`.
- **Port conflicts** – Set the `PORT` environment variable before running `npm run dev` or `npm start`.

Enjoy the streamlined Next.js experience while keeping the original MongoDB extraction workflow intact!
