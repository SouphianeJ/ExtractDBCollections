export type PreconfiguredMongoUri = {
  id: string;
  name: string;
  uri: string;
};

export type ResolveMongoConnectionResult =
  | { success: true; uri: string }
  | { success: false; error: string; status: number };

const MAX_PRECONFIGURED_URIS = 4;

function buildPreconfiguredMongoUris(): PreconfiguredMongoUri[] {
  const uris: PreconfiguredMongoUri[] = [];

  for (let index = 1; index <= MAX_PRECONFIGURED_URIS; index += 1) {
    const uri = (process.env[`MONGODB_URI${index}`] ?? '').trim();
    const name = (process.env[`MONGODB_URI${index}_NAME`] ?? '').trim();

    if (!uri || !name) {
      continue;
    }

    uris.push({
      id: `preconfigured-${index}`,
      name,
      uri
    });
  }

  return uris;
}

let cachedPreconfiguredMongoUris: PreconfiguredMongoUri[] | null = null;

export function getPreconfiguredMongoUris(): PreconfiguredMongoUri[] {
  if (!cachedPreconfiguredMongoUris) {
    cachedPreconfiguredMongoUris = buildPreconfiguredMongoUris();
  }

  return cachedPreconfiguredMongoUris;
}

export function findPreconfiguredMongoUri(id: string): PreconfiguredMongoUri | undefined {
  return getPreconfiguredMongoUris().find((option) => option.id === id);
}

export function resolveMongoConnectionUri(
  mongoUri: string,
  preconfiguredMongoUriId: string
): ResolveMongoConnectionResult {
  const trimmedId = preconfiguredMongoUriId.trim();

  if (trimmedId) {
    const preconfigured = findPreconfiguredMongoUri(trimmedId);

    if (!preconfigured) {
      return {
        success: false,
        error: 'The selected MongoDB connection is not available. Please choose another option.',
        status: 400
      };
    }

    if (!preconfigured.uri) {
      return {
        success: false,
        error:
          'MongoDB URI is not configured for the selected option. Update your environment variables or use a custom URI.',
        status: 400
      };
    }

    return { success: true, uri: preconfigured.uri };
  }

  const trimmedMongoUri = mongoUri.trim();

  if (!trimmedMongoUri) {
    return {
      success: false,
      error: 'MongoDB URI is required',
      status: 400
    };
  }

  return { success: true, uri: trimmedMongoUri };
}
