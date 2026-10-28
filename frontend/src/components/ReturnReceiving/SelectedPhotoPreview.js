import React, { useEffect, useState } from 'react';
import PhotoPreview from './PhotoPreview';

export default function SelectedPhotoPreview({ file, label }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const previewUrl = URL.createObjectURL(file);
    setUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [file]);

  return url ? <PhotoPreview key={url} url={url} name={file.name} label={label} alt={'Selected photo: ' + file.name} /> : null;
}
