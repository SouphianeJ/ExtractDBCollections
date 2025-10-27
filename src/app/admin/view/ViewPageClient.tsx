'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import CopyToClipboardButton from '@/components/CopyToClipboardButton';

type CollectionPreview = {
  name: string;
  documents: unknown[];
};

type ViewParams = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
  allCollections: boolean;
};

type ViewResponse = {
  collections: CollectionPreview[];
};

function parseBoolean(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return value === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

export default function ViewPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [collections, setCollections] = useState<CollectionPreview[]>([]);
  const [selectedCollectionName, setSelectedCollectionName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const params = useMemo<ViewParams>(() => {
    const mongoUri = searchParams.get('mongoUri') ?? '';
    const preconfiguredMongoUriId = searchParams.get('preconfiguredMongoUriId') ?? '';
    const databaseName = searchParams.get('databaseName') ?? '';
    const collectionName = searchParams.get('collectionName') ?? '';
    const allCollections = parseBoolean(searchParams.get('allCollections'));

    return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName, allCollections };
  }, [searchParams]);

  useEffect(() => {
    if (!params.databaseName || (!params.allCollections && !params.collectionName)) {
      setErrorMessage('Missing database or collection information. Please go back and try again.');
      setCollections([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function loadPreviews() {
      setIsLoading(true);
      setErrorMessage('');

      const payload = {
        mongoUri: params.mongoUri,
        preconfiguredMongoUriId: params.preconfiguredMongoUriId,
        databaseName: params.databaseName,
        collectionName: params.collectionName,
        allCollections: params.allCollections
      };

      try {
        const response = await fetch('/api/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let message = 'Unable to load collections. Please verify your selections and try again.';
          try {
            const body = (await response.json()) as { error?: string; message?: string };
            message = body?.error || body?.message || message;
          } catch (parseError) {
            console.warn('Failed to parse preview error response', parseError);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as ViewResponse;

        if (isCancelled) {
          return;
        }

        setCollections(Array.isArray(data.collections) ? data.collections : []);
        setErrorMessage('');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch collection previews:', error);
        const message = error instanceof Error ? error.message : 'Failed to load collection previews.';
        setErrorMessage(message);
        setCollections([]);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPreviews().catch((error) => {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Unexpected preview load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [params, refreshKey]);

  useEffect(() => {
    if (!collections.length) {
      setSelectedCollectionName('');
      return;
    }

    const availableNames = collections.map((collection) => collection.name);
    const preferredCollection =
      params.collectionName && availableNames.includes(params.collectionName)
        ? params.collectionName
        : availableNames[0] ?? '';

    setSelectedCollectionName(preferredCollection);
  }, [collections, params.collectionName]);

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedCollectionName(event.target.value);
  };

  const handleRefresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.name === selectedCollectionName),
    [collections, selectedCollectionName]
  );

  const databaseSummary = params.databaseName ? `Database: ${params.databaseName}` : '';
  const collectionSummary = params.allCollections
    ? `Showing all collections${params.collectionName ? ` (focused on ${params.collectionName})` : ''}`
    : params.collectionName
    ? `Collection: ${params.collectionName}`
    : '';

  return (
    <main className="page view-page">
      <div className="container">
        <div className="header">
          <h1>Explore MongoDB Collections</h1>
          <p>Preview random documents without downloading files</p>
        </div>

        <div className="connection-summary">
          {databaseSummary && <span>{databaseSummary}</span>}
          {collectionSummary && <span>{collectionSummary}</span>}
        </div>

        <div className="view-actions">
          <button className="secondary-button refresh-button" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh samples'}
          </button>
          <Link className="link-button" href="/admin">
            Back to extractor
          </Link>
        </div>

        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

        {isLoading ? (
          <div className="loading-state">Loading collection previews…</div>
        ) : collections.length === 0 ? (
          <div className="empty-state">
            <p>No documents were found for the selected collection(s).</p>
          </div>
        ) : (
          <div className="documents-view">
            {collections.length > 1 && (
              <div className="collection-switcher">
                <label htmlFor="collectionSelect">Choose a collection</label>
                <select
                  id="collectionSelect"
                  className="form-control"
                  value={selectedCollectionName}
                  onChange={handleCollectionChange}
                >
                  {collections.map((collection) => (
                    <option key={collection.name} value={collection.name}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeCollection ? (
              <div className="documents-container">
                <h2>{activeCollection.name}</h2>
                {activeCollection.documents.length ? (
                  activeCollection.documents.map((document, index) => {
                    const json = JSON.stringify(document, null, 2);

                    return (
                      <div key={index} className="document-card">
                        <CopyToClipboardButton text={json} className="document-copy-button" />
                        <pre>{json}</pre>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <p>No documents found in this collection.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <p>Select a collection to view its documents.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
