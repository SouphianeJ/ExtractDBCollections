# MongoDB Collection Extractor

A full-stack application powered by **Next.js** that lets you extract MongoDB collections and download them as JSON (single collection) or ZIP archives (multiple collections). The UI and API live in the same project, eliminating the Angular + Express monorepo setup while keeping all existing functionality.

## Features

- **MongoDB URI Connection** – Connect to any MongoDB instance via connection string
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
│   └── page.tsx               # UI with the extraction form and download logic
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

## Usage

1. Open the app at `http://localhost:3000`.
2. Enter your **MongoDB URI**.
3. (Optional) Provide a **collection name**. Leave blank and enable *Extract all collections* to export everything.
4. Toggle **Extract only 3 random documents** if you want a sample instead of the full dataset.
5. Click **Extract & Download**.
6. The browser downloads either a JSON file (single collection) or a ZIP archive (multiple collections).

## API Endpoints

### `POST /api/extract`

Extracts data from MongoDB based on the submitted payload.

**Request body**

```json
{
  "mongoUri": "mongodb://localhost:27017/mydb",
  "collectionName": "users",
  "limitTo3": false,
  "allCollections": false
}
```

**Responses**

- **200 JSON** – Single collection export (attachment with `<collection>.json`)
- **200 ZIP** – Multiple collection export (attachment with `collections.zip`)
- **400 JSON** – Validation error (missing URI or collection)
- **500 JSON** – Extraction failure details

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
