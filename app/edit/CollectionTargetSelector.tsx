'use client';

import { ChangeEvent } from 'react';

export type CollectionMode = 'existing' | 'new';

type CollectionTargetSelectorProps = {
  mode: CollectionMode;
  existingCollectionName: string;
  newCollectionName: string;
  onModeChange: (mode: CollectionMode) => void;
  onNewCollectionNameChange: (value: string) => void;
  disabled?: boolean;
};

export default function CollectionTargetSelector({
  mode,
  existingCollectionName,
  newCollectionName,
  onModeChange,
  onNewCollectionNameChange,
  disabled = false
}: CollectionTargetSelectorProps) {
  const handleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === 'new' ? 'new' : 'existing';
    onModeChange(value);
  };

  const handleNewCollectionChange = (event: ChangeEvent<HTMLInputElement>) => {
    onNewCollectionNameChange(event.target.value);
  };

  const hasExistingCollection = Boolean(existingCollectionName);
  const isExistingDisabled = disabled || !hasExistingCollection;

  return (
    <fieldset className="form-group collection-target-selector">
      <legend>Choose where to insert the document</legend>

      <div className="collection-target-option">
        <label className="collection-target-label" htmlFor="collection-mode-existing">
          <input
            id="collection-mode-existing"
            type="radio"
            name="collectionMode"
            value="existing"
            checked={mode === 'existing'}
            onChange={handleModeChange}
            disabled={isExistingDisabled}
          />
          <span className="collection-target-label-text">
            Use the selected collection
            {hasExistingCollection ? <strong> ({existingCollectionName})</strong> : null}
          </span>
        </label>
        {!hasExistingCollection ? (
          <p className="help-text">No collection was pre-selected. Choose this option after selecting one from the extractor.</p>
        ) : (
          <p className="help-text">Insert the document into the existing collection shown above.</p>
        )}
      </div>

      <div className="collection-target-option">
        <label className="collection-target-label" htmlFor="collection-mode-new">
          <input
            id="collection-mode-new"
            type="radio"
            name="collectionMode"
            value="new"
            checked={mode === 'new'}
            onChange={handleModeChange}
            disabled={disabled}
          />
          <span className="collection-target-label-text">Create a new collection</span>
        </label>
        <div className="new-collection-input">
          <label htmlFor="newCollectionName">New collection name</label>
          <input
            id="newCollectionName"
            name="newCollectionName"
            type="text"
            className="form-control"
            placeholder="Enter the collection name"
            value={newCollectionName}
            onChange={handleNewCollectionChange}
            disabled={disabled || mode !== 'new'}
          />
          <p className="help-text">The collection will be created automatically if it does not exist.</p>
        </div>
      </div>
    </fieldset>
  );
}
