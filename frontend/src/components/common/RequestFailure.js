import React from 'react';
import { BackToListing } from './listNavigation';

export default function RequestFailure({ error, basePath }) {
  return <div className="app-card">
    <p role="alert" className="mb-4 text-red-800">{error || 'Unable to load this record. Please try again.'}</p>
    <div className="app-actions">
      <button type="button" className="app-button" onClick={() => window.location.reload()}>Try again</button>
      <BackToListing fallback={basePath} />
    </div>
  </div>;
}
