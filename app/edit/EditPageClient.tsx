'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import CollectionModeSelector, { CollectionMode } from '../../components/CollectionModeSelector';
import CopyToClipboardButton from '../../components/CopyToClipboardButton';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [documentJson, setDocumentJson] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('existing');
  const [newCollectionName, setNewCollectionName] = useState('');

  const params = useMemo<EditParams>(() => {
    const mongoUri = searchParams.get('mongoUri') ?? '';
    const preconfiguredMongoUriId = searchParams.get('preconfiguredMongoUriId') ?? '';
    const databaseName = searchParams.get('databaseName') ?? '';
    const collectionName = searchParams.get('collectionName') ?? '';

    return { mongoUri, preconfiguredMongoUriId, databaseName, collectionName };
  }, [searchParams]);

  useEffect(() => {
    if (params.collectionName) {
      setCollectionMode('existing');
      setNewCollectionName(params.collectionName);
    } else {
      setCollectionMode('new');
      setNewCollectionName('');
    }
  }, [params.collectionName]);

  useEffect(() => {
    if (!params.databaseName) {
      setErrorMessage('Missing database information. Please go back and try again.');
      setInfoMessage('');
      setDocumentJson('');
      setIsLoading(false);
      return;
    }

    if (collectionMode === 'new') {
      setIsLoading(false);
      setErrorMessage('');
      setSuccessMessage('');
      setInfoMessage('Provide the JSON document to create your new collection. A sample is not available yet.');
      setDocumentJson((current) => {
        if (current.trim().length === 0) {
          return '{\n\n}';
        }
        return current;
      });
      return;
    }

    if (!params.collectionName) {
      setErrorMessage('Missing collection information. Please go back and try again.');
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

  const handleDocumentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDocumentJson(event.target.value);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleRefreshSample = () => {
    if (collectionMode === 'existing') {
      setRefreshKey((value) => value + 1);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    if (!params.databaseName) {
      setErrorMessage('Database is required to insert a document.');
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

    const targetCollectionName =
      collectionMode === 'new' ? newCollectionName.trim() : params.collectionName;

    if (!targetCollectionName) {
      setErrorMessage('Collection name is required to insert a document.');
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

      setSuccessMessage(
        collectionMode === 'new'
          ? 'Document inserted successfully. The collection has been created or updated.'
          : 'Document inserted successfully.'
      );
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
  const collectionSummary =
    collectionMode === 'new'
      ? newCollectionName.trim()
        ? `New collection: ${newCollectionName.trim()}`
        : 'New collection: (name required)'
      : params.collectionName
      ? `Collection: ${params.collectionName}`
      : '';
  const hasDocumentText = documentJson.trim().length > 0;

  return (
    <main className="page edit-page">
      <div className="container">
        <div className="header">
          <h1>Add a document to your collection</h1>
          <p>Use the sample JSON below as a template and customize it before inserting.</p>
        </div>

        <div className="connection-summary">
          {databaseSummary && <span>{databaseSummary}</span>}
          {collectionSummary && <span>{collectionSummary}</span>}
        </div>

        <CollectionModeSelector
          mode={collectionMode}
          existingCollectionName={params.collectionName}
          newCollectionName={newCollectionName}
          onModeChange={(mode) => {
            setCollectionMode(mode);
            setSuccessMessage('');
            setErrorMessage('');
            setInfoMessage('');
          }}
          onNewCollectionNameChange={setNewCollectionName}
        />

        <div className="view-actions">
          {collectionMode === 'existing' ? (
            <button
              className="secondary-button refresh-button"
              onClick={handleRefreshSample}
              disabled={isLoading || isSubmitting}
            >
              {isLoading ? 'Loading sample…' : 'Load another sample'}
            </button>
          ) : (
            <div className="view-actions__notice">
              Samples are unavailable when creating a new collection.
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
