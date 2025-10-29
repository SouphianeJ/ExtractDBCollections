'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import CopyToClipboardButton from '../../components/CopyToClipboardButton';

type MongoUriOption = { id: string; name: string };

type SearchPageClientProps = {
  preconfiguredOptions: MongoUriOption[];
};

type SearchResponse = {
  documents: unknown[];
};

export default function SearchPageClient({ preconfiguredOptions }: SearchPageClientProps) {
  const hasPreconfiguredOptions = preconfiguredOptions.length > 0;
  const defaultMongoUriSelection = hasPreconfiguredOptions ? preconfiguredOptions[0].id : 'custom';

  const [mongoUriSelection, setMongoUriSelection] = useState<string>(defaultMongoUriSelection);
  const [customMongoUri, setCustomMongoUri] = useState('');
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [databaseError, setDatabaseError] = useState('');
  const [collectionError, setCollectionError] = useState('');
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [documents, setDocuments] = useState<unknown[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const mongoUriOptions = useMemo(() => {
    if (!hasPreconfiguredOptions) {
      return [{ id: 'custom', name: 'Enter custom MongoDB URI' }];
    }

    return [
      ...preconfiguredOptions,
      { id: 'custom', name: 'Enter custom MongoDB URI' }
    ];
  }, [hasPreconfiguredOptions, preconfiguredOptions]);

  const isUsingCustomMongoUri = mongoUriSelection === 'custom';
  const trimmedMongoUri = customMongoUri.trim();
  const selectedPreconfiguredId = isUsingCustomMongoUri ? '' : mongoUriSelection;
  const connectionKey = isUsingCustomMongoUri ? trimmedMongoUri : selectedPreconfiguredId;

  const trimmedDatabaseName = selectedDatabase.trim();
  const trimmedCollectionName = selectedCollection.trim();
  const trimmedSearchTerm = searchTerm.trim();

  const hasConnectionDetails = Boolean(connectionKey);
  const canSearch =
    hasConnectionDetails &&
    trimmedDatabaseName &&
    trimmedCollectionName &&
    !isSearching &&
    !isLoadingDatabases &&
    !isLoadingCollections;

  useEffect(() => {
    if (!hasPreconfiguredOptions) {
      setMongoUriSelection('custom');
    }
  }, [hasPreconfiguredOptions]);

  useEffect(() => {
    setSelectedDatabase('');
    setDatabaseOptions([]);
    setDatabaseError('');
    setSelectedCollection('');
    setCollectionOptions([]);
    setCollectionError('');
    setDocuments([]);
    setHasSearched(false);
  }, [connectionKey]);

  useEffect(() => {
    if (!connectionKey) {
      setDatabaseOptions([]);
      setDatabaseError('');
      setIsLoadingDatabases(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function loadDatabases() {
      setIsLoadingDatabases(true);
      setDatabaseError('');

      const payload = isUsingCustomMongoUri
        ? { mongoUri: trimmedMongoUri, preconfiguredMongoUriId: '' }
        : { mongoUri: '', preconfiguredMongoUriId: selectedPreconfiguredId };

      try {
        const response = await fetch('/api/databases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let message = 'Unable to load databases for the selected connection.';
          try {
            const body = (await response.json()) as { error?: string; message?: string };
            message = body?.error || body?.message || message;
          } catch (parseError) {
            console.warn('Failed to parse database error response', parseError);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as { databases?: string[] };
        const options = Array.isArray(data.databases) ? data.databases : [];

        if (isCancelled) {
          return;
        }

        setDatabaseOptions(options);
        setSelectedDatabase((previous) => {
          if (previous && options.includes(previous)) {
            return previous;
          }
          return options[0] ?? '';
        });
        setDatabaseError('');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch databases:', error);
        const message = error instanceof Error ? error.message : 'Unable to load databases.';
        setDatabaseError(message);
        setDatabaseOptions([]);
        setSelectedDatabase('');
      } finally {
        if (!isCancelled) {
          setIsLoadingDatabases(false);
        }
      }
    }

    loadDatabases().catch((error) => {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Unexpected database load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, selectedPreconfiguredId, trimmedMongoUri]);

  useEffect(() => {
    if (!connectionKey || !trimmedDatabaseName) {
      setCollectionOptions([]);
      setSelectedCollection('');
      setCollectionError('');
      setIsLoadingCollections(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function loadCollections() {
      setIsLoadingCollections(true);
      setCollectionError('');

      const payload = isUsingCustomMongoUri
        ? { mongoUri: trimmedMongoUri, preconfiguredMongoUriId: '', databaseName: trimmedDatabaseName }
        : { mongoUri: '', preconfiguredMongoUriId: selectedPreconfiguredId, databaseName: trimmedDatabaseName };

      try {
        const response = await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let message = 'Unable to load collections for the selected database.';
          try {
            const body = (await response.json()) as { error?: string; message?: string };
            message = body?.error || body?.message || message;
          } catch (parseError) {
            console.warn('Failed to parse collection error response', parseError);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as { collections?: string[] };
        const options = Array.isArray(data.collections) ? data.collections : [];

        if (isCancelled) {
          return;
        }

        setCollectionOptions(options);
        setSelectedCollection((previous) => {
          if (previous && options.includes(previous)) {
            return previous;
          }
          return options[0] ?? '';
        });
        setCollectionError('');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch collections:', error);
        const message = error instanceof Error ? error.message : 'Unable to load collections.';
        setCollectionError(message);
        setCollectionOptions([]);
        setSelectedCollection('');
      } finally {
        if (!isCancelled) {
          setIsLoadingCollections(false);
        }
      }
    }

    loadCollections().catch((error) => {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Unexpected collection load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, selectedPreconfiguredId, trimmedDatabaseName, trimmedMongoUri]);

  useEffect(() => {
    setDocuments([]);
    setHasSearched(false);
  }, [trimmedDatabaseName, trimmedCollectionName]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSearch) {
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setHasSearched(true);
    setDocuments([]);

    const payload = {
      mongoUri: isUsingCustomMongoUri ? trimmedMongoUri : '',
      preconfiguredMongoUriId: isUsingCustomMongoUri ? '' : selectedPreconfiguredId,
      databaseName: trimmedDatabaseName,
      collectionName: trimmedCollectionName,
      searchTerm: trimmedSearchTerm
    };

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let message = 'Unable to perform the search. Please verify your inputs and try again.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse search error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as SearchResponse;
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setSearchError('');
    } catch (error) {
      console.error('Failed to search documents:', error);
      const message = error instanceof Error ? error.message : 'Unable to search documents at this time.';
      setSearchError(message);
      setDocuments([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="search-page__content">
      <div className="header">
        <h1>Search MongoDB Collections</h1>
        <p>Find documents by scanning the selected collection for matching content.</p>
      </div>

      <form className="search-form" onSubmit={handleSearch}>
        <div className="form-group">
          <label htmlFor="mongoUriSelect">MongoDB connection</label>
          <select
            id="mongoUriSelect"
            className="form-control"
            value={mongoUriSelection}
            onChange={(event) => setMongoUriSelection(event.target.value)}
          >
            {mongoUriOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {isUsingCustomMongoUri && (
          <div className="form-group">
            <label htmlFor="customMongoUri">Custom MongoDB URI</label>
            <input
              id="customMongoUri"
              className="form-control"
              type="text"
              placeholder="mongodb+srv://username:password@cluster.mongodb.net"
              value={customMongoUri}
              onChange={(event) => setCustomMongoUri(event.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="databaseSelect">Database</label>
          <select
            id="databaseSelect"
            className="form-control"
            value={selectedDatabase}
            onChange={(event) => setSelectedDatabase(event.target.value)}
            disabled={!hasConnectionDetails || isLoadingDatabases}
          >
            {!hasConnectionDetails ? (
              <option value="">Select a connection to load databases</option>
            ) : isLoadingDatabases ? (
              <option value="">Loading databases…</option>
            ) : databaseOptions.length === 0 ? (
              <option value="">No databases available</option>
            ) : null}
            {databaseOptions.map((database) => (
              <option key={database} value={database}>
                {database}
              </option>
            ))}
          </select>
          {databaseError && <div className="error">{databaseError}</div>}
        </div>

        <div className="form-group">
          <label htmlFor="collectionSelect">Collection</label>
          <select
            id="collectionSelect"
            className="form-control"
            value={selectedCollection}
            onChange={(event) => setSelectedCollection(event.target.value)}
            disabled={!trimmedDatabaseName || isLoadingCollections}
          >
            {!trimmedDatabaseName ? (
              <option value="">Select a database first</option>
            ) : isLoadingCollections ? (
              <option value="">Loading collections…</option>
            ) : collectionOptions.length === 0 ? (
              <option value="">No collections available</option>
            ) : null}
            {collectionOptions.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
          {collectionError && <div className="error">{collectionError}</div>}
        </div>

        <div className="form-group">
          <label htmlFor="searchTerm">Search term</label>
          <input
            id="searchTerm"
            className="form-control"
            type="text"
            placeholder="Enter a keyword to search for"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <small className="help-text">
            Searches for documents where the JSON representation contains this text. Leave empty to preview the first
            results.
          </small>
        </div>

        <div className="search-actions">
          <button className="submit-button" type="submit" disabled={!canSearch}>
            {isSearching ? 'Searching…' : 'Search documents'}
          </button>
          <Link className="secondary-button" href="/admin">
            Back to extractor
          </Link>
        </div>
      </form>

      {searchError && <div className="alert alert-error">{searchError}</div>}

      {isSearching && <div className="loading-state">Searching documents…</div>}

      {!isSearching && hasSearched && !searchError && (
        <div className="documents-container">
          <h2>Search results</h2>
          {documents.length === 0 ? (
            <div className="empty-state">
              <p>No documents matched your search.</p>
            </div>
          ) : (
            <div className="documents-grid">
              {documents.map((document, index) => {
                const json = JSON.stringify(document, null, 2);

                return (
                  <div key={index} className="document-card">
                    <CopyToClipboardButton text={json} className="document-copy-button" />
                    <pre>{json}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
