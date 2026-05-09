'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import CopyToClipboardButton from '../../components/CopyToClipboardButton';
import type { MongoUriOption } from '../../components/ExtractorForm';

const SEARCH_LIMIT = 10;

const DEFAULT_QUERY = '';

type SearchPageClientProps = {
  preconfiguredOptions: MongoUriOption[];
};

type SearchResponse = {
  documents?: unknown[];
  mode?: 'json' | 'text';
  hasMore?: boolean;
  limit?: number;
  offset?: number;
};

export default function SearchPageClient({ preconfiguredOptions }: SearchPageClientProps) {
  const hasPreconfiguredOptions = preconfiguredOptions.length > 0;
  const defaultMongoUriSelection = hasPreconfiguredOptions ? preconfiguredOptions[0].id : 'custom';

  const [mongoUriSelection, setMongoUriSelection] = useState<string>(defaultMongoUriSelection);
  const [customMongoUri, setCustomMongoUri] = useState('');
  const [databaseName, setDatabaseName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY);
  const [excludeQueryInput, setExcludeQueryInput] = useState('');
  const [documents, setDocuments] = useState<unknown[]>([]);
  const [queryMode, setQueryMode] = useState<'json' | 'text'>('json');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);

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
  const trimmedQuery = queryInput.trim();
  const trimmedExcludeQuery = excludeQueryInput.trim();

  const connectionKey = isUsingCustomMongoUri ? trimmedMongoUri : selectedPreconfiguredId;
  const hasConnectionDetails = Boolean(connectionKey);

  useEffect(() => {
    if (connectionKey === previousConnectionKeyRef.current) {
      return;
    }

    previousConnectionKeyRef.current = connectionKey;

    setDatabaseName('');
    setCollectionName('');
    setDocuments([]);
    setCurrentPage(0);
    setHasMoreResults(false);
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
    setDocuments([]);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
    setCollectionErrorMessage('');
    lastLoadedCollectionsKeyRef.current = '';
  };

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCollectionName(event.target.value);
    setDocuments([]);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQueryInput(event.target.value);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
  };

  const handleExcludeQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setExcludeQueryInput(event.target.value);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
  };

  const isSubmitDisabled =
    !hasConnectionDetails ||
    !trimmedDatabaseName ||
    !trimmedCollectionName ||
    isSearching ||
    isLoadingDatabases ||
    isLoadingCollections;

  const mongoUriSummary = isUsingCustomMongoUri
    ? trimmedMongoUri || 'Custom MongoDB URI'
    : selectedPreconfiguredOption?.name || 'Preconfigured connection';
  const crudHref = useMemo(() => {
    const params = new URLSearchParams();

    if (trimmedDatabaseName) {
      params.set('databaseName', trimmedDatabaseName);
    }

    if (trimmedCollectionName) {
      params.set('collectionName', trimmedCollectionName);
    }

    if (isUsingCustomMongoUri && trimmedMongoUri) {
      params.set('mongoUri', trimmedMongoUri);
    } else if (selectedPreconfiguredId) {
      params.set('preconfiguredMongoUriId', selectedPreconfiguredId);
    }

    if (trimmedQuery) {
      params.set('query', trimmedQuery);
    }

    if (trimmedExcludeQuery) {
      params.set('excludeQuery', trimmedExcludeQuery);
    }

    const queryString = params.toString();
    return queryString ? `/crud?${queryString}` : '/crud';
  }, [
    isUsingCustomMongoUri,
    selectedPreconfiguredId,
    trimmedMongoUri,
    trimmedDatabaseName,
    trimmedCollectionName,
    trimmedQuery,
    trimmedExcludeQuery
  ]);

  const executeSearch = async (page: number) => {
    const rawQuery = trimmedQuery || DEFAULT_QUERY;
    const payload = isUsingCustomMongoUri
      ? {
          mongoUri: trimmedMongoUri,
          preconfiguredMongoUriId: '',
          databaseName: trimmedDatabaseName,
          collectionName: trimmedCollectionName,
          query: rawQuery,
          excludeQuery: trimmedExcludeQuery,
          page
        }
      : {
          mongoUri: '',
          preconfiguredMongoUriId: selectedPreconfiguredId,
          databaseName: trimmedDatabaseName,
          collectionName: trimmedCollectionName,
          query: rawQuery,
          excludeQuery: trimmedExcludeQuery,
          page
        };

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
      setQueryMode(data.mode === 'text' ? 'text' : 'json');
      setCurrentPage(page);
      setHasMoreResults(Boolean(data.hasMore));
    } catch (error) {
      console.error('Failed to execute search:', error);
      const message = error instanceof Error ? error.message : 'Unknown error while searching.';
      setSearchError(message);
      setHasMoreResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    await executeSearch(0);
  };

  const handlePreviousPage = async () => {
    if (currentPage === 0 || isSearching) {
      return;
    }

    await executeSearch(currentPage - 1);
  };

  const handleNextPage = async () => {
    if (!hasMoreResults || isSearching) {
      return;
    }

    await executeSearch(currentPage + 1);
  };

  const resultStart = documents.length ? currentPage * SEARCH_LIMIT + 1 : 0;
  const resultEnd = documents.length ? resultStart + documents.length - 1 : 0;

  return (
    <main className="page search-page">
      <div className="container">
        <div className="header">
          <h1>Search MongoDB Documents</h1>
          <p>Run targeted queries and preview up to {SEARCH_LIMIT} matching documents per page.</p>
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

          <div className="form-group">
            <label htmlFor="searchQuery">Contains (text or JSON)</label>
            <input
              id="searchQuery"
              name="searchQuery"
              type="text"
              className="form-control"
              value={queryInput}
              onChange={handleQueryChange}
              placeholder='STAPS or {"status": "active"}'
            />
            <p className="help-text">
              Optional. Use plain text to match terms across discovered fields, or provide a JSON filter such as{' '}
              {'{"email": "example@domain.com"}'}.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="excludeQuery">Does not contain</label>
            <input
              id="excludeQuery"
              name="excludeQuery"
              type="text"
              className="form-control"
              value={excludeQueryInput}
              onChange={handleExcludeQueryChange}
              placeholder="test"
            />
            <p className="help-text">
              Optional. Excludes any document containing one of these text terms across discovered fields.
            </p>
          </div>

          {searchError && <div className="alert alert-error">{searchError}</div>}

          <div className="search-actions">
            <button type="submit" className="primary-button" disabled={isSubmitDisabled}>
              {isSearching ? 'Searching…' : 'Search documents'}
            </button>
            <Link className="link-button" href={crudHref}>
              Open CRUD workspace
            </Link>
            <Link className="link-button" href="/admin">
              Back to dashboard
            </Link>
          </div>
        </form>

        <div className="documents-view">
          <div className="documents-view__header">
            <div>
              <h2>Results</h2>
              <p>
                Plain text searches split your terms across discovered fields. The exclusion field stays optional and
                filters out matching documents.
              </p>
            </div>
            <span className="search-mode-pill">
              {queryMode === 'text' ? 'Tokenized text search across fields' : 'JSON filter mode'}
            </span>
          </div>
          {isSearching ? (
            <div className="loading-state">Searching documents…</div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <p>No documents to display. Run a search to see up to {SEARCH_LIMIT} results per page.</p>
            </div>
          ) : (
            <div className="documents-container">
              <h2>
                Showing {resultStart}-{resultEnd} from {collectionName}
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

          {(documents.length > 0 || currentPage > 0 || hasMoreResults) && (
            <div className="pagination-controls">
              <button
                className="secondary-button pagination-button"
                type="button"
                onClick={handlePreviousPage}
                disabled={isSearching || currentPage === 0}
              >
                Previous 10
              </button>
              <span className="pagination-status">Page {currentPage + 1}</span>
              <button
                className="secondary-button pagination-button"
                type="button"
                onClick={handleNextPage}
                disabled={isSearching || !hasMoreResults}
              >
                Next 10
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
