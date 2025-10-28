'use client';

import type { ChangeEvent } from 'react';

export type CollectionMode = 'existing' | 'new';

type CollectionModeSelectorProps = {
  mode: CollectionMode;
  existingCollectionName?: string;
  newCollectionName: string;
  onModeChange: (mode: CollectionMode) => void;
  onNewCollectionNameChange: (value: string) => void;
};

export default function CollectionModeSelector({
  mode,
  existingCollectionName,
  newCollectionName,
  onModeChange,
  onNewCollectionNameChange
}: CollectionModeSelectorProps) {
  const existingOptionClassName = existingCollectionName
    ? 'collection-mode-option'
    : 'collection-mode-option collection-mode-option--disabled';

  const handleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === 'existing' ? 'existing' : 'new';

    if (value === 'existing' && !existingCollectionName) {
      onModeChange('new');
      return;
    }

    onModeChange(value);
  };

  const handleNewCollectionNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onNewCollectionNameChange(event.target.value);
  };

  return (
    <div className="collection-mode-selector">
      <span className="collection-mode-selector__label">Collection selection</span>
      <div className="collection-mode-options">
        <label className={existingOptionClassName}>
          <input
            type="radio"
            name="collectionMode"
            value="existing"
            checked={mode === 'existing'}
            disabled={!existingCollectionName}
            onChange={handleModeChange}
          />
          <div className="collection-mode-option__content">
            <span className="collection-mode-option__title">Use existing collection</span>
            <span className="collection-mode-option__description">
              {existingCollectionName
                ? `Currently selected: ${existingCollectionName}`
                : 'Select a collection from the extractor form to load a template.'}
            </span>
          </div>
        </label>
        <label className="collection-mode-option">
          <input
            type="radio"
            name="collectionMode"
            value="new"
            checked={mode === 'new'}
            onChange={handleModeChange}
          />
          <div className="collection-mode-option__content">
            <span className="collection-mode-option__title">Create a new collection</span>
            <span className="collection-mode-option__description">
              Insert the first document for a new collection. We will create it if it does not exist.
            </span>
          </div>
        </label>
      </div>
      {mode === 'new' ? (
        <div className="form-group">
          <label className="collection-mode-selector__input-label" htmlFor="newCollectionName">
            New collection name
          </label>
          <input
            id="newCollectionName"
            name="newCollectionName"
            type="text"
            className="form-control"
            value={newCollectionName}
            onChange={handleNewCollectionNameChange}
            placeholder="Enter a collection name"
            autoComplete="off"
          />
          <p className="help-text">Provide the name for the collection you want to create.</p>
        </div>
      ) : null}
    </div>
  );
}
