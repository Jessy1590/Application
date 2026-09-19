import React from 'react';
import LocationPhieMount from '../shared/LocationPhieMount.jsx';

/**
 * Transcription — UI + OCR PhieEvreux (Azure / Gemini / Tesseract).
 */
export default function LocationTranscription({ onNavigate = null }) {
  return (
    <div className="min-h-[70vh] -m-1">
      <LocationPhieMount
        module="transcription"
        surface="dashboard"
        onNavigate={onNavigate}
        showChrome
      />
    </div>
  );
}
