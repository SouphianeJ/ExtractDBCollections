'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import CopyToClipboardButton from '../../components/CopyToClipboardButton';
import type { MongoUriOption } from '../../components/ExtractorForm';

const SEARCH_LIMIT = 10;

const DEFAULT_QUERY = '{}';

type SearchPageClientProps = {
  preconfiguredOptions: MongoUriOption[];
};

type SearchResponse = {
  documents?: unknown[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default function SearchPageClient({ preconfiguredOptions }: SearchPageClientProps) {
  const hasPreconfiguredOptions = preconfiguredOptions.length > 0;
  const defaultMongoUriSelection = hasPreconfiguredOptions ? preconfiguredOptions[0].id : 'custom';

  const [mongoUriSelection, setMongoUriSelection] = useState<string>(defaultMongoUriSelection);
  const [customMongoUri, setCustomMongoUri] = useState('');
  const [databaseName, setDatabaseName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY);
  const [textSearchInput, setTextSearchInput] = useState('');
  const [documents, setDocuments] = useState<unknown[]>([]);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'json' | 'text'>('json');

  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<string[]>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [databaseErrorMessage, setDatabaseErrorMessage] = useState('');
  const [collectionErrorMessage, setCollectionErrorMessage] = useState('');

  const previousConnectionKeyRef = useRef('');
  const lastLoadedDatabasesKeyRef = useRef('');
  const lastLoadedCollectionsKeyRef = useRef('');

  const isUsingCustomMongoUri = mongoUriSelection === 'custom';
  const selectedPreconfiguredId = isUsingCustomMongoUri ? '' : mongoUriSelection;

  useEffect(() => {
    if (!hasPreconfiguredOptions) {
      setMongoUriSelection('custom');
    }
  }, [hasPreconfiguredOptions]);

  const selectedPreconfiguredOption = useMemo(
    () => preconfiguredOptions.find((option) => option.id === selectedPreconfiguredId),
    [preconfiguredOptions, selectedPreconfiguredId]
  );

  const trimmedMongoUri = customMongoUri.trim();
  const trimmedDatabaseName = databaseName.trim();
  const trimmedCollectionName = collectionName.trim();

  const connectionKey = isUsingCustomMongoUri ? trimmedMongoUri : selectedPreconfiguredId;
  const hasConnectionDetails = Boolean(connectionKey);

  useEffect(() => {
    if (connectionKey === previousConnectionKeyRef.current) {
      return;
    }

    previousConnectionKeyRef.current = connectionKey;

    setDatabaseName('');
    setCollectionName('');
    setDatabaseOptions([]);
    setCollectionOptions([]);
    setDatabaseErrorMessage('');
    setCollectionErrorMessage('');
    lastLoadedDatabasesKeyRef.current = '';
    lastLoadedCollectionsKeyRef.current = '';
  }, [connectionKey]);

  useEffect(() => {
    if (!connectionKey) {
      setDatabaseOptions([]);
      setDatabaseErrorMessage('');
      setIsLoadingDatabases(false);
      lastLoadedDatabasesKeyRef.current = '';
      return;
    }

    if (lastLoadedDatabasesKeyRef.current === connectionKey) {
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    lastLoadedDatabasesKeyRef.current = connectionKey;
    setIsLoadingDatabases(true);
    setDatabaseErrorMessage('');
    setDatabaseOptions([]);

    const payload = isUsingCustomMongoUri
      ? { mongoUri: trimmedMongoUri, preconfiguredMongoUriId: '' }
      : { mongoUri: '', preconfiguredMongoUriId: selectedPreconfiguredId };

    async function loadDatabases() {
      try {
        const response = await fetch('/api/databases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let errorText = 'Failed to load databases. Please verify your connection and try again.';
          try {
            const body = (await response.json()) as { error?: string; message?: string };
            errorText = body?.error || body?.message || errorText;
          } catch (parseError) {
            console.warn('Failed to parse databases error response', parseError);
          }
          throw new Error(errorText);
        }

        const data = (await response.json()) as { databases?: string[] };
        const databases = Array.isArray(data.databases) ? data.databases : [];

        if (isCancelled) {
          return;
        }

        setDatabaseOptions(databases);
        setDatabaseErrorMessage(databases.length ? '' : 'No databases found for this connection.');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch databases for search page:', error);
        const message = error instanceof Error ? error.message : 'Failed to load databases.';
        setDatabaseErrorMessage(message);
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
      console.error('Unexpected search databases load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, selectedPreconfiguredId, trimmedMongoUri]);

  useEffect(() => {
    if (!connectionKey || !trimmedDatabaseName) {
      setCollectionOptions([]);
      setCollectionErrorMessage('');
      setIsLoadingCollections(false);
      lastLoadedCollectionsKeyRef.current = '';
      return;
    }

    const collectionsKey = `${connectionKey}::${trimmedDatabaseName}`;

    if (lastLoadedCollectionsKeyRef.current === collectionsKey) {
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    lastLoadedCollectionsKeyRef.current = collectionsKey;
    setIsLoadingCollections(true);
    setCollectionErrorMessage('');
    setCollectionOptions([]);

    const payload = isUsingCustomMongoUri
      ? { mongoUri: trimmedMongoUri, preconfiguredMongoUriId: '', databaseName: trimmedDatabaseName }
      : {
          mongoUri: '',
          preconfiguredMongoUriId: selectedPreconfiguredId,
          databaseName: trimmedDatabaseName
        };

    async function loadCollections() {
      try {
        const response = await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let errorText = 'Failed to load collections. Please verify your selection and try again.';
          try {
            const body = (await response.json()) as { error?: string; message?: string };
            errorText = body?.error || body?.message || errorText;
          } catch (parseError) {
            console.warn('Failed to parse collections error response', parseError);
          }
          throw new Error(errorText);
        }

        const data = (await response.json()) as { collections?: string[] };
        const collections = Array.isArray(data.collections) ? data.collections : [];

        if (isCancelled) {
          return;
        }

        setCollectionOptions(collections);
        setCollectionErrorMessage(collections.length ? '' : 'No collections found in the selected database.');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch collections for search page:', error);
        const message = error instanceof Error ? error.message : 'Failed to load collections.';
        setCollectionErrorMessage(message);
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
      console.error('Unexpected search collections load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, selectedPreconfiguredId, trimmedDatabaseName, trimmedMongoUri]);

  const handleMongoUriSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setMongoUriSelection(event.target.value);
    setSearchError('');
  };

  const handleMongoUriChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isUsingCustomMongoUri) {
      return;
    }

    setCustomMongoUri(event.target.value);
    setSearchError('');
    setDatabaseErrorMessage('');
    setCollectionErrorMessage('');
  };

  const handleDatabaseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDatabaseName(event.target.value);
    setCollectionName('');
    setSearchError('');
    setCollectionErrorMessage('');
    lastLoadedCollectionsKeyRef.current = '';
  };

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCollectionName(event.target.value);
    setSearchError('');
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQueryInput(event.target.value);
    setSearchError('');
  };

  const handleTextSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTextSearchInput(event.target.value);
    setSearchError('');
  };

  const handleSearchModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === 'text' ? 'text' : 'json';
    setSearchMode(value);
    setSearchError('');
  };

  const isSubmitDisabled =
    !hasConnectionDetails ||
    !trimmedDatabaseName ||
    !trimmedCollectionName ||
    isSearching ||
    isLoadingDatabases ||
    isLoadingCollections ||
    (searchMode === 'text' && textSearchInput.trim().length === 0);

  const mongoUriSummary = isUsingCustomMongoUri
    ? trimmedMongoUri || 'Custom MongoDB URI'
    : selectedPreconfiguredOption?.name || 'Preconfigured connection';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    const basePayload = isUsingCustomMongoUri
      ? {
          mongoUri: trimmedMongoUri,
          preconfiguredMongoUriId: '',
          databaseName: trimmedDatabaseName,
          collectionName: trimmedCollectionName
        }
      : {
          mongoUri: '',
          preconfiguredMongoUriId: selectedPreconfiguredId,
          databaseName: trimmedDatabaseName,
          collectionName: trimmedCollectionName
        };

    let payload:
      | (typeof basePayload & { mode: 'json'; query: string; text: string })
      | (typeof basePayload & { mode: 'text'; query: string; text: string });

    if (searchMode === 'text') {
      const textQuery = textSearchInput.trim();

      if (!textQuery) {
        setSearchError('Enter text to search for.');
        return;
      }

      payload = {
        ...basePayload,
        mode: 'text',
        query: '',
        text: textQuery
      };
    } else {
      const rawQuery = queryInput.trim() || DEFAULT_QUERY;
      let parsedQuery: unknown;

      try {
        parsedQuery = JSON.parse(rawQuery);
      } catch (error) {
        setSearchError('Search filter must be valid JSON. Example: {"status": "active"}');
        return;
      }

      if (!isPlainObject(parsedQuery)) {
        setSearchError('Search filter must be a JSON object.');
        return;
      }

      payload = {
        ...basePayload,
        mode: 'json',
        query: JSON.stringify(parsedQuery),
        text: ''
      };
    }

    setIsSearching(true);
    setSearchError('');
    setDocuments([]);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let message = 'Search failed. Please verify your details and try again.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse search error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as SearchResponse;
      const foundDocuments = Array.isArray(data.documents) ? data.documents : [];
      setDocuments(foundDocuments);
    } catch (error) {
      console.error('Failed to execute search:', error);
      const message = error instanceof Error ? error.message : 'Unknown error while searching.';
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="page search-page">
      <div className="container">
        <div className="header">
          <h1>Search MongoDB Documents</h1>
          <p>Run targeted queries and preview up to {SEARCH_LIMIT} matching documents.</p>
        </div>

        <p className="connection-summary">Connected through: {mongoUriSummary}</p>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mongoUriSelection">MongoDB connection</label>
            <select
              id="mongoUriSelection"
              className="form-control"
              value={mongoUriSelection}
              onChange={handleMongoUriSelectionChange}
            >
              {hasPreconfiguredOptions &&
                preconfiguredOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              <option value="custom">Enter custom MongoDB URI</option>
            </select>
            {selectedPreconfiguredOption && !isUsingCustomMongoUri && (
              <p className="help-text">Using preconfigured URI: {selectedPreconfiguredOption.name}</p>
            )}
          </div>

          {isUsingCustomMongoUri && (
            <div className="form-group">
              <label htmlFor="mongoUri">MongoDB connection string</label>
              <input
                id="mongoUri"
                name="mongoUri"
                type="text"
                className="form-control"
                value={customMongoUri}
                onChange={handleMongoUriChange}
                placeholder="mongodb+srv://user:password@cluster.mongodb.net"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="databaseName">Database</label>
            <select
              id="databaseName"
              className="form-control"
              value={databaseName}
              onChange={handleDatabaseChange}
              disabled={!hasConnectionDetails || isLoadingDatabases}
            >
              <option value="">
                {!hasConnectionDetails
                  ? 'Select a connection to load databases'
                  : isLoadingDatabases
                  ? 'Loading databases…'
                  : 'Select a database'}
              </option>
              {databaseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {databaseErrorMessage && <p className="error">{databaseErrorMessage}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="collectionName">Collection</label>
            <select
              id="collectionName"
              className="form-control"
              value={collectionName}
              onChange={handleCollectionChange}
              disabled={!trimmedDatabaseName || isLoadingCollections}
            >
              <option value="">
                {!trimmedDatabaseName
                  ? 'Select a database first'
                  : isLoadingCollections
                  ? 'Loading collections…'
                  : 'Select a collection'}
              </option>
              {collectionOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {collectionErrorMessage && <p className="error">{collectionErrorMessage}</p>}
          </div>

          <fieldset className="form-group">
            <legend>Search mode</legend>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="searchMode"
                  value="json"
                  checked={searchMode === 'json'}
                  onChange={handleSearchModeChange}
                />
                JSON filter
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="searchMode"
                  value="text"
                  checked={searchMode === 'text'}
                  onChange={handleSearchModeChange}
                />
                Contains text
              </label>
            </div>
          </fieldset>

          {searchMode === 'text' ? (
            <div className="form-group">
              <label htmlFor="textSearch">Text to find</label>
              <input
                id="textSearch"
                name="textSearch"
                type="text"
                className="form-control"
                value={textSearchInput}
                onChange={handleTextSearchChange}
                placeholder="Search text within documents"
              />
              <p className="help-text">
                Find documents where any field contains this text (case-insensitive).
              </p>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="searchQuery">Search filter (JSON)</label>
              <input
                id="searchQuery"
                name="searchQuery"
                type="text"
                className="form-control"
                value={queryInput}
                onChange={handleQueryChange}
                placeholder='{"status": "active"}'
              />
              <p className="help-text">
                Enter a MongoDB filter as JSON. Example: {'{"email": "example@domain.com"}'}
              </p>
            </div>
          )}

          {searchError && <div className="alert alert-error">{searchError}</div>}

          <div className="search-actions">
            <button type="submit" className="primary-button" disabled={isSubmitDisabled}>
              {isSearching ? 'Searching…' : 'Search documents'}
            </button>
            <Link className="link-button" href="/admin">
              Back to extractor
            </Link>
          </div>
        </form>

        <div className="documents-view">
          {isSearching ? (
            <div className="loading-state">Searching documents…</div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <p>No documents to display. Run a search to see up to {SEARCH_LIMIT} results.</p>
            </div>
          ) : (
            <div className="documents-container">
              <h2>
                Showing {documents.length} document{documents.length === 1 ? '' : 's'} from {collectionName}
              </h2>
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
      </div>
    </main>
  );
}
