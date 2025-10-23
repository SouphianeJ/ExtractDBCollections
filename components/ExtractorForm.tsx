'use client';

import { ChangeEvent, FocusEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

export type MongoUriOption = {
  id: string;
  name: string;
};

type ExtractionFormData = {
  mongoUri: string;
  databaseName: string;
  collectionName: string;
  limitTo3: boolean;
  allCollections: boolean;
};

type ExtractionRequestPayload = ExtractionFormData & {
  preconfiguredMongoUriId: string;
};

type TouchedFields = {
  mongoUri: boolean;
  databaseName: boolean;
  collectionName: boolean;
};

type ExtractorFormProps = {
  preconfiguredOptions: MongoUriOption[];
};

const initialForm: ExtractionFormData = {
  mongoUri: '',
  databaseName: '',
  collectionName: '',
  limitTo3: false,
  allCollections: false
};

export default function ExtractorForm({ preconfiguredOptions }: ExtractorFormProps) {
  const hasPreconfiguredOptions = preconfiguredOptions.length > 0;
  const defaultMongoUriSelection = hasPreconfiguredOptions ? preconfiguredOptions[0].id : 'custom';

  const [mongoUriSelection, setMongoUriSelection] = useState<string>(defaultMongoUriSelection);
  const [formData, setFormData] = useState<ExtractionFormData>(initialForm);
  const [touched, setTouched] = useState<TouchedFields>({ mongoUri: false, databaseName: false, collectionName: false });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
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
      return;
    }

    if (mongoUriSelection === 'custom') {
      return;
    }

    const exists = preconfiguredOptions.some((option) => option.id === mongoUriSelection);
    if (!exists) {
      setMongoUriSelection(preconfiguredOptions[0].id);
    }
  }, [hasPreconfiguredOptions, mongoUriSelection, preconfiguredOptions]);

  const mongoUriOptions = useMemo(() => {
    if (!hasPreconfiguredOptions) {
      return [{ id: 'custom', name: 'Enter custom MongoDB URI' }];
    }

    return [
      ...preconfiguredOptions,
      { id: 'custom', name: 'Enter custom MongoDB URI' }
    ];
  }, [hasPreconfiguredOptions, preconfiguredOptions]);

  const selectedPreconfiguredOption = useMemo(
    () => preconfiguredOptions.find((option) => option.id === selectedPreconfiguredId),
    [preconfiguredOptions, selectedPreconfiguredId]
  );

  const trimmedMongoUri = formData.mongoUri.trim();
  const trimmedDatabaseName = formData.databaseName.trim();
  const trimmedCollectionName = formData.collectionName.trim();
  const connectionKey = isUsingCustomMongoUri ? trimmedMongoUri : selectedPreconfiguredId;
  const hasConnectionDetails = Boolean(connectionKey);
  const isCollectionNameDisabled = formData.allCollections;
  const isMongoUriInvalid = isUsingCustomMongoUri && touched.mongoUri && !trimmedMongoUri;
  const isDatabaseInvalid = touched.databaseName && !trimmedDatabaseName;
  const isCollectionNameInvalid =
    touched.collectionName && !trimmedCollectionName && !formData.allCollections;

  const isSubmitDisabled =
    isLoading ||
    isLoadingDatabases ||
    (!formData.allCollections && isLoadingCollections) ||
    (isUsingCustomMongoUri ? !trimmedMongoUri : !selectedPreconfiguredId) ||
    !trimmedDatabaseName ||
    (!formData.allCollections && !trimmedCollectionName);

  const isDatabaseSelectDisabled = isLoading || isLoadingDatabases || !hasConnectionDetails;
  const hasCollectionOptions = collectionOptions.length > 0;
  const isCollectionSelectDisabled =
    isCollectionNameDisabled ||
    isLoading ||
    isLoadingCollections ||
    !trimmedDatabaseName ||
    !hasCollectionOptions;
  const databasePlaceholderLabel = !hasConnectionDetails
    ? 'Select or enter a connection to load databases'
    : isLoadingDatabases
    ? 'Loading databases…'
    : 'Select a database';
  const collectionPlaceholderLabel = formData.allCollections
    ? 'Collection selection disabled when extracting all collections'
    : !trimmedDatabaseName
    ? 'Select a database first'
    : isLoadingCollections
    ? 'Loading collections…'
    : hasCollectionOptions
    ? 'Select a collection'
    : 'No collections available';
  const databaseHelpText = !hasConnectionDetails
    ? 'Select a MongoDB connection above to load available databases.'
    : 'Choose the database that contains the collections you want to extract.';
  const collectionHelpText = formData.allCollections
    ? 'Collection selection is disabled when extracting all collections.'
    : 'Choose the collection you want to export.';

  useEffect(() => {
    if (connectionKey === previousConnectionKeyRef.current) {
      return;
    }

    previousConnectionKeyRef.current = connectionKey;

    setFormData((prev) => ({ ...prev, databaseName: '', collectionName: '' }));
    setTouched((prev) => ({ ...prev, databaseName: false, collectionName: false }));
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
            const errorBody = await response.json();
            errorText = errorBody?.error || errorBody?.message || errorText;
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

        console.error('Failed to fetch databases:', error);
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
      console.error('Unexpected databases load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, trimmedMongoUri, selectedPreconfiguredId]);

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
            const errorBody = await response.json();
            errorText = errorBody?.error || errorBody?.message || errorText;
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
        setCollectionErrorMessage(
          collections.length ? '' : 'No collections found in the selected database.'
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch collections:', error);
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
      console.error('Unexpected collections load error:', error);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [connectionKey, isUsingCustomMongoUri, trimmedMongoUri, selectedPreconfiguredId, trimmedDatabaseName]);

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    if (name === 'mongoUri' && !isUsingCustomMongoUri) {
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrorMessage('');
    setSuccessMessage('');

    if (name === 'mongoUri') {
      setDatabaseErrorMessage('');
      setCollectionErrorMessage('');
    }
  };

  const handleMongoUriSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setMongoUriSelection(value);
    setTouched((prev) => ({ ...prev, mongoUri: value === 'custom' ? prev.mongoUri : false }));
    setErrorMessage('');
    setSuccessMessage('');
    setDatabaseErrorMessage('');
    setCollectionErrorMessage('');
  };

  const handleDatabaseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setFormData((prev) => ({ ...prev, databaseName: value, collectionName: '' }));
    setTouched((prev) => ({ ...prev, databaseName: true, collectionName: false }));
    setCollectionOptions([]);
    setCollectionErrorMessage('');
    lastLoadedCollectionsKeyRef.current = '';
    setErrorMessage('');
    setSuccessMessage('');
    setDatabaseErrorMessage('');
  };

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setFormData((prev) => ({ ...prev, collectionName: value }));
    setTouched((prev) => ({ ...prev, collectionName: true }));
    setErrorMessage('');
    setSuccessMessage('');
    setCollectionErrorMessage('');
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFormData((prev) => {
      if (name === 'allCollections') {
        return {
          ...prev,
          allCollections: checked,
          collectionName: checked ? '' : prev.collectionName
        };
      }

      return { ...prev, [name]: checked } as ExtractionFormData;
    });
    setErrorMessage('');
    setSuccessMessage('');

    if (name === 'allCollections' && checked) {
      setTouched((prev) => ({ ...prev, collectionName: false }));
    }

    if (name === 'allCollections') {
      setCollectionErrorMessage('');
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const { name } = event.target;

    if (name === 'mongoUri' && !isUsingCustomMongoUri) {
      return;
    }

    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouched({ mongoUri: isUsingCustomMongoUri, databaseName: true, collectionName: !formData.allCollections });

    if (isSubmitDisabled) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload: ExtractionRequestPayload = {
        mongoUri: isUsingCustomMongoUri ? trimmedMongoUri : '',
        databaseName: trimmedDatabaseName,
        collectionName: trimmedCollectionName,
        limitTo3: formData.limitTo3,
        allCollections: formData.allCollections,
        preconfiguredMongoUriId: selectedPreconfiguredId
      };

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorText = 'Failed to extract data. Please check your MongoDB URI and try again.';
        try {
          const errorBody = await response.json();
          errorText = errorBody?.error || errorBody?.message || errorText;
        } catch (error) {
          console.warn('Failed to parse error response', error);
        }
        throw new Error(errorText);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'download';

      if (contentDisposition) {
        const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccessMessage('Data extracted successfully!');
    } catch (error) {
      console.error('Extraction failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to extract data.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="container">
        <div className="header">
          <h1>MongoDB Collection Extractor</h1>
          <p>Extract collections from MongoDB and download as JSON</p>
        </div>

        <form className="extraction-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mongoUriSelection">MongoDB connection</label>
            <select
              id="mongoUriSelection"
              name="mongoUriSelection"
              className="form-control"
              value={mongoUriSelection}
              onChange={handleMongoUriSelectionChange}
              disabled={isLoading}
            >
              {mongoUriOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="mongoUri">MongoDB URI</label>
            <input
              id="mongoUri"
              name="mongoUri"
              type="text"
              className="form-control"
              placeholder="mongodb://localhost:27017/mydb"
              value={
                isUsingCustomMongoUri
                  ? formData.mongoUri
                  : selectedPreconfiguredOption
                  ? `Preconfigured: ${selectedPreconfiguredOption.name}`
                  : ''
              }
              onChange={handleTextChange}
              onBlur={handleBlur}
              disabled={!isUsingCustomMongoUri || isLoading}
              required={isUsingCustomMongoUri}
            />
            {!isUsingCustomMongoUri && selectedPreconfiguredOption ? (
              <p className="help-text">Using the preconfigured connection string named “{selectedPreconfiguredOption.name}”</p>
            ) : (
              <p className="help-text">Enter a MongoDB connection string</p>
            )}
            {isMongoUriInvalid && <div className="error">MongoDB URI is required</div>}
          </div>

          <div className="form-group">
            <label htmlFor="databaseName">Database</label>
            <select
              id="databaseName"
              name="databaseName"
              className="form-control"
              value={formData.databaseName}
              onChange={handleDatabaseChange}
              disabled={isDatabaseSelectDisabled}
            >
              <option value="">{databasePlaceholderLabel}</option>
              {databaseOptions.map((database) => (
                <option key={database} value={database}>
                  {database}
                </option>
              ))}
            </select>
            <p className="help-text">{databaseHelpText}</p>
            {isLoadingDatabases && <p className="help-text">Loading databases…</p>}
            {databaseErrorMessage && <div className="error">{databaseErrorMessage}</div>}
            {isDatabaseInvalid && <div className="error">Database selection is required</div>}
          </div>

          <div className="form-group">
            <label htmlFor="collectionName">Collection</label>
            <select
              id="collectionName"
              name="collectionName"
              className="form-control"
              value={formData.collectionName}
              onChange={handleCollectionChange}
              disabled={isCollectionSelectDisabled}
              required={!formData.allCollections}
            >
              <option value="">{collectionPlaceholderLabel}</option>
              {collectionOptions.map((collection) => (
                <option key={collection} value={collection}>
                  {collection}
                </option>
              ))}
            </select>
            <p className="help-text">{collectionHelpText}</p>
            {isLoadingCollections && !formData.allCollections && (
              <p className="help-text">Loading collections…</p>
            )}
            {collectionErrorMessage && <div className="error">{collectionErrorMessage}</div>}
            {isCollectionNameInvalid && <div className="error">Collection selection is required</div>}
          </div>

          <div className="checkbox-group">
            <label className="checkbox-label" htmlFor="limitTo3">
              <input
                id="limitTo3"
                name="limitTo3"
                type="checkbox"
                checked={formData.limitTo3}
                onChange={handleCheckboxChange}
                disabled={isLoading}
              />
              <span>Extract only 3 random documents</span>
            </label>
            <p className="help-text">Limits the extraction to 3 randomly selected documents from each collection</p>
          </div>

          <div className="checkbox-group">
            <label className="checkbox-label" htmlFor="allCollections">
              <input
                id="allCollections"
                name="allCollections"
                type="checkbox"
                checked={formData.allCollections}
                onChange={handleCheckboxChange}
                disabled={isLoading}
              />
              <span>Extract all collections</span>
            </label>
            <p className="help-text">Extract from all collections in the database (disables collection name field)</p>
          </div>

          {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
          {successMessage && <div className="alert alert-success">{successMessage}</div>}

          <button className="submit-button" type="submit" disabled={isSubmitDisabled}>
            {isLoading ? 'Extracting…' : 'Extract & Download'}
          </button>
        </form>

        <div className="info-box">
          <h3>How it works:</h3>
          <ul>
            <li>Single collection → Downloads a JSON file with the documents</li>
            <li>Multiple collections → Downloads a ZIP file containing one JSON file per collection</li>
            <li>3 documents mode → Randomly selects 3 documents from each collection</li>
            <li>Full extraction → Downloads all documents from the collection(s)</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
