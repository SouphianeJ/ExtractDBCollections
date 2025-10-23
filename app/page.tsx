'use client';

import { ChangeEvent, FocusEvent, FormEvent, useState } from 'react';

type ExtractionRequest = {
  mongoUri: string;
  collectionName: string;
  limitTo3: boolean;
  allCollections: boolean;
};

type TouchedFields = {
  mongoUri: boolean;
  collectionName: boolean;
};

const initialForm: ExtractionRequest = {
  mongoUri: '',
  collectionName: '',
  limitTo3: false,
  allCollections: false
};

export default function HomePage() {
  const [formData, setFormData] = useState<ExtractionRequest>(initialForm);
  const [touched, setTouched] = useState<TouchedFields>({ mongoUri: false, collectionName: false });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isCollectionNameDisabled = formData.allCollections;
  const isMongoUriInvalid = touched.mongoUri && !formData.mongoUri.trim();
  const isCollectionNameInvalid =
    touched.collectionName && !formData.collectionName.trim() && !formData.allCollections;

  const isSubmitDisabled =
    isLoading ||
    !formData.mongoUri.trim() ||
    (!formData.allCollections && !formData.collectionName.trim());

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrorMessage('');
    setSuccessMessage('');
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

      return { ...prev, [name]: checked } as ExtractionRequest;
    });
    setErrorMessage('');
    setSuccessMessage('');

    if (name === 'allCollections' && checked) {
      setTouched((prev) => ({ ...prev, collectionName: false }));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouched({ mongoUri: true, collectionName: true });

    if (isSubmitDisabled) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mongoUri: formData.mongoUri.trim(),
          collectionName: formData.collectionName.trim(),
          limitTo3: formData.limitTo3,
          allCollections: formData.allCollections
        })
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
        const match = contentDisposition.match(/filename="?([^";]+)"?/i);
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
            <label htmlFor="mongoUri">MongoDB URI</label>
            <input
              id="mongoUri"
              name="mongoUri"
              type="text"
              className="form-control"
              placeholder="mongodb://localhost:27017/mydb"
              value={formData.mongoUri}
              onChange={handleTextChange}
              onBlur={handleBlur}
              disabled={isLoading}
              required
            />
            {isMongoUriInvalid && <div className="error">MongoDB URI is required</div>}
          </div>

          <div className="form-group">
            <label htmlFor="collectionName">Collection Name</label>
            <input
              id="collectionName"
              name="collectionName"
              type="text"
              className="form-control"
              placeholder="users"
              value={formData.collectionName}
              onChange={handleTextChange}
              onBlur={handleBlur}
              disabled={isCollectionNameDisabled || isLoading}
            />
            {isCollectionNameInvalid && <div className="error">Collection name is required</div>}
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
