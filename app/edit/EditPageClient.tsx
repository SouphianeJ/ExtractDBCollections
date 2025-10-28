'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import CopyToClipboardButton from '../../components/CopyToClipboardButton';
import CollectionTargetSelector, { CollectionMode } from './CollectionTargetSelector';

type EditParams = {
  mongoUri: string;
  preconfiguredMongoUriId: string;
  databaseName: string;
  collectionName: string;
};

type SampleResponse = {
  sample: unknown | null;
};

type InsertResponse = {
  success: boolean;
  insertedId?: string;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
};

function formatDocument(document: unknown): string {
  if (typeof document === 'undefined') {
    return '';
  }

  if (document === null) {
    return '{\n\n}';
  }

  try {
    return JSON.stringify(document, null, 2);
  } catch (error) {
    console.warn('Failed to stringify document for editing template', error);
    return '{\n\n}';
  }
}

export default function EditPageClient() {
  const searchParams = useSearchParams();
  const params = useMemo<EditParams>(() => {
    const mongoUri = searchParams.get('mongoUri') ?? '';
    const preconfiguredMongoUriId = searchParams.get('preconfiguredMongoUriId') ?? '';
    const databaseName = searchParams.get('databaseName') ?? '';
    const collectionName = searchParams.get('collectionName') ?? '';

    return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName };
  }, [searchParams]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [documentJson, setDocumentJson] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>(
    params.collectionName ? 'existing' : 'new'
  );
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    if (!params.collectionName && collectionMode === 'existing') {
      setCollectionMode('new');
    }
  }, [params.collectionName, collectionMode]);

  useEffect(() => {
    if (collectionMode === 'new') {
      setIsLoading(false);
      setErrorMessage('');
      setInfoMessage('Provide the name of the new collection and the JSON for its first document.');
      setDocumentJson((current) => (current.trim() ? current : '{\n\n}'));
      return;
    }

    if (!params.databaseName || !params.collectionName) {
      setErrorMessage('Missing database or collection information. Please go back and try again.');
      setInfoMessage('');
      setDocumentJson('');
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function loadSample() {
      setIsLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      setInfoMessage('');

      const payload = {
        mongoUri: params.mongoUri,
        preconfiguredMongoUriId: params.preconfiguredMongoUriId,
        databaseName: params.databaseName,
        collectionName: params.collectionName,
        action: 'sample' as const
      };

      try {
        const response = await fetch('/api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          let message = 'Unable to load a sample document. Please verify your selections and try again.';
          try {
            const body = (await response.json()) as ApiErrorBody;
            message = body?.error || body?.message || message;
          } catch (parseError) {
            console.warn('Failed to parse edit sample error response', parseError);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as SampleResponse;

        if (isCancelled) {
          return;
        }

        if (!data.sample) {
          setDocumentJson('{\n\n}');
          setInfoMessage('No existing documents were found. Start by providing a new JSON document below.');
        } else {
          setDocumentJson(formatDocument(data.sample));
          setInfoMessage('Template prefilled with a random document from the collection. Adjust the JSON as needed.');
        }

        setErrorMessage('');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch sample document:', error);
        const message = error instanceof Error ? error.message : 'Failed to load a sample document.';
        setErrorMessage(message);
        setDocumentJson('{\n\n}');
        setInfoMessage('');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSample().catch((error) => {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Unexpected edit sample load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [collectionMode, params, refreshKey]);

  const handleCollectionModeChange = (mode: CollectionMode) => {
    setCollectionMode(mode);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleNewCollectionNameChange = (value: string) => {
    setNewCollectionName(value);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleDocumentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDocumentJson(event.target.value);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleRefreshSample = () => {
    if (collectionMode !== 'existing') {
      return;
    }

    setRefreshKey((value) => value + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    if (!params.databaseName) {
      setErrorMessage('Database name is required to insert a document.');
      return;
    }

    const targetCollectionName = (
      collectionMode === 'existing' ? params.collectionName : newCollectionName
    ).trim();

    if (!targetCollectionName) {
      setErrorMessage('Collection name is required to insert a document.');
      return;
    }

    let parsedDocument: unknown;

    try {
      parsedDocument = documentJson ? JSON.parse(documentJson) : {};
    } catch (error) {
      console.error('Invalid JSON for document insertion:', error);
      setErrorMessage('The provided JSON is invalid. Please correct it and try again.');
      return;
    }

    if (parsedDocument === null || typeof parsedDocument !== 'object' || Array.isArray(parsedDocument)) {
      setErrorMessage('The document must be a JSON object.');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      mongoUri: params.mongoUri,
      preconfiguredMongoUriId: params.preconfiguredMongoUriId,
      databaseName: params.databaseName,
      collectionName: targetCollectionName,
      action: 'insert' as const,
      document: parsedDocument
    };

    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let message = 'Failed to insert the document. Please verify the JSON and try again.';
        try {
          const body = (await response.json()) as ApiErrorBody;
          message = body?.error || body?.message || message;
        } catch (parseError) {
          console.warn('Failed to parse edit insert error response', parseError);
        }
        throw new Error(message);
      }

      const data = (await response.json()) as InsertResponse;

      if (!data.success) {
        throw new Error('The server did not confirm the document insertion.');
      }

      const successText =
        collectionMode === 'new'
          ? 'Document inserted successfully. The collection will be created if it did not already exist.'
          : 'Document inserted successfully.';
      setSuccessMessage(successText);
      setErrorMessage('');
    } catch (error) {
      console.error('Failed to insert document:', error);
      const message = error instanceof Error ? error.message : 'Failed to insert the document.';
      setErrorMessage(message);
      setSuccessMessage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const databaseSummary = params.databaseName ? `Database: ${params.databaseName}` : '';
  const trimmedNewCollectionName = newCollectionName.trim();
  const isExistingMode = collectionMode === 'existing';
  const collectionSummary = isExistingMode
    ? params.collectionName
      ? `Collection: ${params.collectionName}`
      : ''
    : `New collection: ${trimmedNewCollectionName || 'Provide a name below'}`;
  const hasDocumentText = documentJson.trim().length > 0;
  const canLoadSample = isExistingMode;
  const headerDescription = isExistingMode
    ? 'Use the sample JSON below as a template and customize it before inserting.'
    : 'Provide the collection name and JSON for the first document you want to store.';

  return (
    <main className="page edit-page">
      <div className="container">
        <div className="header">
          <h1>Add a document to your collection</h1>
          <p>{headerDescription}</p>
        </div>

        <div className="connection-summary">
          {databaseSummary && <span>{databaseSummary}</span>}
          {collectionSummary && <span>{collectionSummary}</span>}
        </div>

        <div className="view-actions">
          {canLoadSample ? (
            <button
              className="secondary-button refresh-button"
              onClick={handleRefreshSample}
              disabled={isLoading || isSubmitting}
            >
              {isLoading ? 'Loading sample…' : 'Load another sample'}
            </button>
          ) : (
            <div className="view-actions__info">
              Sample templates are unavailable when creating a new collection.
            </div>
          )}
          <Link className="link-button" href="/">
            Back to extractor
          </Link>
        </div>

        {infoMessage && <div className="alert alert-success">{infoMessage}</div>}
        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        <form className="extraction-form" onSubmit={handleSubmit}>
          <CollectionTargetSelector
            mode={collectionMode}
            existingCollectionName={params.collectionName}
            newCollectionName={newCollectionName}
            onModeChange={handleCollectionModeChange}
            onNewCollectionNameChange={handleNewCollectionNameChange}
            disabled={isLoading || isSubmitting}
          />
          <div className="form-group">
            <label htmlFor="documentJson">JSON document</label>
            <textarea
              id="documentJson"
              name="documentJson"
              className="form-control"
              rows={18}
              value={documentJson}
              onChange={handleDocumentChange}
              disabled={isLoading || isSubmitting}
            />
            <p className="help-text">Provide a valid JSON object. The inserted document will match this structure.</p>
          </div>

          <div className="button-group">
            <button className="submit-button" type="submit" disabled={isLoading || isSubmitting}>
              {isSubmitting ? 'Inserting…' : 'Insert document'}
            </button>
            <CopyToClipboardButton text={documentJson} className="secondary-button" disabled={!hasDocumentText} />
          </div>
        </form>
      </div>
    </main>
  );
}
