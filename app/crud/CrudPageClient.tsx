'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import CopyToClipboardButton from '../../components/CopyToClipboardButton';
import type { MongoUriOption } from '../../components/ExtractorForm';

const SEARCH_LIMIT = 10;
const DEFAULT_EDITOR_VALUE = '{\n\n}';

type CrudPageClientProps = {
  preconfiguredOptions: MongoUriOption[];
};

type SearchMode = 'json' | 'text';

type CrudDocument = Record<string, unknown>;

type CrudSearchResponse = {
  documents?: unknown[];
  mode?: SearchMode;
  hasMore?: boolean;
  limit?: number;
  offset?: number;
};

type CrudMutationResponse = {
  success?: boolean;
  insertedId?: unknown;
  updatedId?: unknown;
  deletedId?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDocument(document: unknown): string {
  try {
    return JSON.stringify(document, null, 2);
  } catch (error) {
    console.error('Failed to format document:', error);
    return DEFAULT_EDITOR_VALUE;
  }
}

function stringifyIdentifier(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error('Failed to stringify document identifier:', error);
    return String(value);
  }
}

export default function CrudPageClient({ preconfiguredOptions }: CrudPageClientProps) {
  const searchParams = useSearchParams();
  const hasPreconfiguredOptions = preconfiguredOptions.length > 0;
  const requestedPreconfiguredId = searchParams.get('preconfiguredMongoUriId') ?? '';
  const defaultMongoUriSelection =
    hasPreconfiguredOptions && preconfiguredOptions.some((option) => option.id === requestedPreconfiguredId)
      ? requestedPreconfiguredId
      : hasPreconfiguredOptions
      ? preconfiguredOptions[0].id
      : 'custom';

  const [mongoUriSelection, setMongoUriSelection] = useState<string>(() => {
    const presetMongoUri = (searchParams.get('mongoUri') ?? '').trim();
    return presetMongoUri ? 'custom' : defaultMongoUriSelection;
  });
  const [customMongoUri, setCustomMongoUri] = useState(() => searchParams.get('mongoUri') ?? '');
  const [databaseName, setDatabaseName] = useState(() => searchParams.get('databaseName') ?? '');
  const [collectionName, setCollectionName] = useState(() => searchParams.get('collectionName') ?? '');
  const [queryInput, setQueryInput] = useState(() => searchParams.get('query') ?? '');
  const [excludeQueryInput, setExcludeQueryInput] = useState(() => searchParams.get('excludeQuery') ?? '');
  const [documents, setDocuments] = useState<CrudDocument[]>([]);
  const [queryMode, setQueryMode] = useState<SearchMode>('json');
  const [searchError, setSearchError] = useState('');
  const [crudError, setCrudError] = useState('');
  const [crudSuccess, setCrudSuccess] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingDocumentKey, setDeletingDocumentKey] = useState('');
  const [editorValue, setEditorValue] = useState(DEFAULT_EDITOR_VALUE);
  const [selectedDocumentId, setSelectedDocumentId] = useState<unknown | null>(null);
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
  const isSearchDisabled =
    !hasConnectionDetails ||
    !trimmedDatabaseName ||
    !trimmedCollectionName ||
    isSearching ||
    isLoadingDatabases ||
    isLoadingCollections;
  const isEditingExistingDocument = selectedDocumentId !== null;

  const crudPageHref = useMemo(() => {
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

  useEffect(() => {
    if (connectionKey === previousConnectionKeyRef.current) {
      return;
    }

    previousConnectionKeyRef.current = connectionKey;

    setDatabaseName('');
    setCollectionName('');
    setDocuments([]);
    setSelectedDocumentId(null);
    setEditorValue(DEFAULT_EDITOR_VALUE);
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
            console.warn('Failed to parse CRUD databases error response', parseError);
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

        console.error('Failed to load CRUD databases:', error);
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
      console.error('Unexpected CRUD databases load error:', error);
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
            console.warn('Failed to parse CRUD collections error response', parseError);
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

        console.error('Failed to load CRUD collections:', error);
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
      console.error('Unexpected CRUD collections load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, selectedPreconfiguredId, trimmedDatabaseName, trimmedMongoUri]);

  const buildConnectionPayload = () =>
    isUsingCustomMongoUri
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

  const performSearch = async ({
    preserveFeedback = false,
    page = 0
  }: { preserveFeedback?: boolean; page?: number } = {}) => {
    if (isSearchDisabled) {
      return false;
    }

    setIsSearching(true);
    setSearchError('');

    if (!preserveFeedback) {
      setCrudError('');
      setCrudSuccess('');
    }

    try {
      const response = await fetch('/api/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildConnectionPayload(),
          action: 'search',
          query: trimmedQuery,
          excludeQuery: trimmedExcludeQuery,
          page
        })
      });

      if (!response.ok) {
        let message = 'Search failed. Please verify your details and try again.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse CRUD search error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as CrudSearchResponse;
      const nextDocuments = Array.isArray(data.documents)
        ? data.documents.filter(isPlainObject)
        : [];

      setDocuments(nextDocuments);
      setQueryMode(data.mode === 'text' ? 'text' : 'json');
      setCurrentPage(page);
      setHasMoreResults(Boolean(data.hasMore));

      if (
        selectedDocumentId !== null &&
        !nextDocuments.some((document) => stringifyIdentifier(document._id) === stringifyIdentifier(selectedDocumentId))
      ) {
        setSelectedDocumentId(null);
      }

      return true;
    } catch (error) {
      console.error('Failed to execute CRUD search:', error);
      const message = error instanceof Error ? error.message : 'Unknown error while searching.';
      setSearchError(message);
      setDocuments([]);
      setHasMoreResults(false);
      return false;
    } finally {
      setIsSearching(false);
    }
  };

  const handleMongoUriSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setMongoUriSelection(event.target.value);
    setSearchError('');
    setCrudError('');
    setCrudSuccess('');
  };

  const handleMongoUriChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isUsingCustomMongoUri) {
      return;
    }

    setCustomMongoUri(event.target.value);
    setSearchError('');
    setCrudError('');
    setCrudSuccess('');
    setDatabaseErrorMessage('');
    setCollectionErrorMessage('');
  };

  const handleDatabaseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDatabaseName(event.target.value);
    setCollectionName('');
    setDocuments([]);
    setSelectedDocumentId(null);
    setEditorValue(DEFAULT_EDITOR_VALUE);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
    setCrudError('');
    setCrudSuccess('');
    setCollectionErrorMessage('');
    lastLoadedCollectionsKeyRef.current = '';
  };

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCollectionName(event.target.value);
    setDocuments([]);
    setSelectedDocumentId(null);
    setEditorValue(DEFAULT_EDITOR_VALUE);
    setCurrentPage(0);
    setHasMoreResults(false);
    setSearchError('');
    setCrudError('');
    setCrudSuccess('');
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

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditorValue(event.target.value);
    setCrudError('');
    setCrudSuccess('');
  };

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performSearch({ page: 0 });
  };

  const handlePreviousPage = async () => {
    if (currentPage === 0 || isSearching) {
      return;
    }

    await performSearch({ page: currentPage - 1 });
  };

  const handleNextPage = async () => {
    if (!hasMoreResults || isSearching) {
      return;
    }

    await performSearch({ page: currentPage + 1 });
  };

  const handleSelectDocument = (document: CrudDocument) => {
    setSelectedDocumentId(document._id ?? null);
    setEditorValue(formatDocument(document));
    setCrudError('');
    setCrudSuccess('');
  };

  const handleResetEditor = () => {
    setSelectedDocumentId(null);
    setEditorValue(DEFAULT_EDITOR_VALUE);
    setCrudError('');
    setCrudSuccess('');
  };

  const handleSaveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasConnectionDetails || !trimmedDatabaseName || !trimmedCollectionName || isSaving) {
      return;
    }

    let parsedDocument: unknown;

    try {
      parsedDocument = editorValue ? JSON.parse(editorValue) : {};
    } catch (error) {
      console.error('Invalid CRUD editor JSON:', error);
      setCrudError('The document must be valid JSON.');
      setCrudSuccess('');
      return;
    }

    if (!isPlainObject(parsedDocument)) {
      setCrudError('The document must be a JSON object.');
      setCrudSuccess('');
      return;
    }

    setIsSaving(true);
    setCrudError('');
    setCrudSuccess('');

    const action = isEditingExistingDocument ? 'update' : 'create';

    try {
      const response = await fetch('/api/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildConnectionPayload(),
          action,
          document: parsedDocument,
          documentId: selectedDocumentId
        })
      });

      if (!response.ok) {
        let message = 'Unable to save the document.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse CRUD save error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as CrudMutationResponse;

      if (!data.success) {
        throw new Error('The server did not confirm the change.');
      }

      if (action === 'create') {
        setCrudSuccess('Document created successfully.');
        setSelectedDocumentId(null);
        setEditorValue(DEFAULT_EDITOR_VALUE);
      } else {
        setCrudSuccess('Document updated successfully.');
      }

      await performSearch({ preserveFeedback: true, page: currentPage });
    } catch (error) {
      console.error('Failed to save CRUD document:', error);
      const message = error instanceof Error ? error.message : 'Failed to save the document.';
      setCrudError(message);
      setCrudSuccess('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = async (document: CrudDocument) => {
    const documentId = document._id;

    if (typeof documentId === 'undefined') {
      setCrudError('Cannot delete a document without an identifier.');
      setCrudSuccess('');
      return;
    }

    const confirmed = window.confirm('Delete this document permanently? This action cannot be undone.');

    if (!confirmed) {
      return;
    }

    const documentKey = stringifyIdentifier(documentId);
    setDeletingDocumentKey(documentKey);
    setCrudError('');
    setCrudSuccess('');

    try {
      const response = await fetch('/api/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildConnectionPayload(),
          action: 'delete',
          documentId
        })
      });

      if (!response.ok) {
        let message = 'Unable to delete the document.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse CRUD delete error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as CrudMutationResponse;

      if (!data.success) {
        throw new Error('The server did not confirm the deletion.');
      }

      if (selectedDocumentId !== null && stringifyIdentifier(selectedDocumentId) === documentKey) {
        handleResetEditor();
      }

      setCrudSuccess('Document deleted successfully.');
      await performSearch({ preserveFeedback: true, page: currentPage });
    } catch (error) {
      console.error('Failed to delete CRUD document:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete the document.';
      setCrudError(message);
      setCrudSuccess('');
    } finally {
      setDeletingDocumentKey('');
    }
  };

  const mongoUriSummary = isUsingCustomMongoUri
    ? trimmedMongoUri || 'Custom MongoDB URI'
    : selectedPreconfiguredOption?.name || 'Preconfigured connection';
  const editorHeading = isEditingExistingDocument ? 'Update selected document' : 'Create a new document';
  const editorDescription = isEditingExistingDocument
    ? 'Edit the JSON below, then save to replace the current document.'
    : 'Provide a JSON object and save it to insert a new document into the selected collection.';
  const hasEditorText = editorValue.trim().length > 0;
  const resultStart = documents.length ? currentPage * SEARCH_LIMIT + 1 : 0;
  const resultEnd = documents.length ? resultStart + documents.length - 1 : 0;

  return (
    <main className="page crud-page">
      <div className="container container--wide">
        <div className="header">
          <h1>MongoDB CRUD Workspace</h1>
          <p>Create, inspect, update and delete documents from one dedicated page.</p>
        </div>

        <p className="connection-summary">Connected through: {mongoUriSummary}</p>

        <div className="crud-layout">
          <form className="crud-panel crud-panel--filters search-form" onSubmit={handleSearchSubmit}>
              <h2 className="crud-panel__title">Connection</h2>

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
                <p className="help-text help-text--compact">
                  Optional. Plain text splits your terms and matches them across discovered document fields. JSON stays
                  available for exact MongoDB filters.
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
                <p className="help-text help-text--compact">
                  Optional. Excludes any document containing one of these text terms across discovered fields.
                </p>
              </div>

              {searchError && <div className="alert alert-error">{searchError}</div>}

              <div className="search-actions">
                <button type="submit" className="primary-button" disabled={isSearchDisabled}>
                  {isSearching ? 'Searching…' : 'Search documents'}
                </button>
                <Link className="link-button" href="/admin">
                  Back to dashboard
                </Link>
              </div>
          </form>

          <form className="crud-panel crud-panel--editor" onSubmit={handleSaveDocument}>
              <div className="crud-editor__header">
                <div>
                  <h2 className="crud-panel__title">{editorHeading}</h2>
                  <p className="crud-editor__description">{editorDescription}</p>
                </div>
                <span className="crud-editor__badge">
                  {isEditingExistingDocument ? 'Update mode' : 'Create mode'}
                </span>
              </div>

              {crudError && <div className="alert alert-error">{crudError}</div>}
              {crudSuccess && <div className="alert alert-success">{crudSuccess}</div>}

              <div className="crud-editor">
                <div className="form-group">
                  <label htmlFor="editorValue">Document JSON</label>
                  <textarea
                    id="editorValue"
                    name="editorValue"
                    className="form-control crud-editor__textarea"
                    rows={18}
                    value={editorValue}
                    onChange={handleEditorChange}
                    disabled={isSaving}
                  />
                </div>

                <div className="button-group">
                  <button className="submit-button" type="submit" disabled={isSaving || !trimmedCollectionName}>
                    {isSaving ? 'Saving…' : isEditingExistingDocument ? 'Save changes' : 'Create document'}
                  </button>
                  <button className="secondary-button" type="button" onClick={handleResetEditor} disabled={isSaving}>
                    Reset editor
                  </button>
                  <CopyToClipboardButton
                    text={editorValue}
                    className="secondary-button copy-button--full"
                    disabled={!hasEditorText}
                  />
                </div>
              </div>
          </form>
        </div>

        <section className="documents-view">
          <div className="documents-view__header">
            <div>
              <h2>Results</h2>
              <p>
                {documents.length
                  ? `Showing ${resultStart}-${resultEnd} from ${collectionName}.`
                  : `Run a search to load up to ${SEARCH_LIMIT} documents per page from the selected collection.`}
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
              <p>No documents to display for the current query.</p>
            </div>
          ) : (
            <div className="documents-container">
              {documents.map((document, index) => {
                const json = formatDocument(document);
                const documentId = document._id;
                const documentKey =
                  typeof documentId === 'undefined'
                    ? `${index}-${json}`
                    : stringifyIdentifier(documentId);
                const isDeleting = deletingDocumentKey === documentKey;

                return (
                  <div key={documentKey} className="document-card">
                    <div className="document-card__toolbar">
                      <div className="document-card__meta">
                        <span className="document-card__label">Document</span>
                        <strong>{typeof documentId === 'undefined' ? 'No identifier' : documentKey}</strong>
                      </div>
                      <div className="document-card__actions">
                        <button className="mini-button" type="button" onClick={() => handleSelectDocument(document)}>
                          Edit
                        </button>
                        <button
                          className="mini-button mini-button--danger"
                          type="button"
                          onClick={() => handleDeleteDocument(document)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </button>
                        <CopyToClipboardButton text={json} className="document-copy-button document-copy-button--inline" />
                      </div>
                    </div>
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

          <div className="view-actions">
            <Link className="link-button" href={crudPageHref}>
              Refresh current workspace
            </Link>
            <Link className="link-button" href="/extract">
              Open extractor
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
