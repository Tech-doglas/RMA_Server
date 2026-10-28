import Toast from './Toast';
import { canPermission, apiFetch, API_SERVER } from './access';
import { requireOk } from './requestResult';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function ImagePreview({ file, index }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <img src={url || undefined} alt={`Selected attachment ${index + 1}`} className="w-24 h-24 object-cover rounded" />;
}

function GenericForm({ initialData, fields, onSubmit, onDelete, basePath, itemId, isEdit = false, hideBackButton = false, existingImages = {}, no_tracking = false, onTracking, emptyTracking = "" }) {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const formRef = useRef(null);
  const busyRef = useRef(false);
  const [imageList, setImageList] = useState(existingImages || {});
  const navigate = useNavigate();
  const scope = basePath.startsWith('/pc') ? 'pc' : basePath.startsWith('/non-pc') ? 'nonpc' : basePath.startsWith('/xie') ? 'xie' : 'legacy';
  const visibleFields = fields.filter(field => field.type !== 'file' || canPermission(scope + '.photos'));

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === 'file') {
      setFormData((prev) => ({ ...prev, [name]: files }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleMultiImagesChange = (e, i) => {
    const { name, files } = e.target;
    setFormData((prev) => {
      const images = [...(prev[name] || [])];
      images[i] = files[0];
      return { ...prev, [name]: images }
    });
  };

  const validateForm = () => {
    const newErrors = {};
    visibleFields.filter(field => !field.disabled).forEach((field) => {
      const value = formData[field.name];
      if (field.required && (value == null || value === false || (typeof value === 'string' && !value.trim()) || (typeof value === 'object' && !value.length))) {
        newErrors[field.name] = `${field.label} is required`;
      }
      if (field.validate) {
        const error = field.validate(formData[field.name], formData);
        if (error) newErrors[field.name] = error;
      }
      if (field.type === 'file' && value?.length) {
        const selected = Array.from(value).filter(Boolean);
        if (selected.length > 5) newErrors[field.name] = 'Choose up to 5 photos.';
        else if (selected.some(file => !['image/jpeg', 'image/png'].includes(file.type))) newErrors[field.name] = 'Choose JPEG or PNG photos.';
        else if (selected.some(file => file.size > 4 * 1024 * 1024)) newErrors[field.name] = 'Each photo must be 4 MB or smaller.';
      }
    });
    setErrors(newErrors);
    const firstError = Object.keys(newErrors)[0];
    if (firstError) formRef.current?.elements.namedItem(firstError)?.focus();
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    if (validateForm()) {
      busyRef.current = true;
      setSubmitting(true);
      setSubmitError('');
      try {
        const result = await onSubmit(formData);
        if (!result || result.success !== true) {
          setSubmitError(result?.error || 'Changes were not saved. Please review the form and try again.');
          return;
        }
        navigate(result.redirectTo || basePath);
      } catch (error) {
        setSubmitError(error.message || 'Unable to save. Please try again.');
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const handleDeleteClick = async () => {
    if (busyRef.current || !onDelete || !window.confirm('Are you sure you want to delete this item?')) return;
    busyRef.current = true;
    setDeleting(true);
    setSubmitError('');
    try {
      const result = await onDelete();
      if (result?.success === true) navigate(basePath);
      else setSubmitError(result?.error || 'The item was not deleted. Please try again.');
    } catch (error) { setSubmitError(error.message || 'Unable to delete this item.'); }
    finally { busyRef.current = false; setDeleting(false); }
  };

  const handleImageDelete = (filename, type) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    apiFetch(`${API_SERVER}/images/delete_image/${encodeURIComponent(type)}/${encodeURIComponent(itemId)}/${encodeURIComponent(filename)}`, {
      method: 'POST',
    })
      .then(requireOk)
      .then(() => {
          setImageList((prev) => ({
            ...prev,
            list: prev.list.filter((img) => img !== filename),
          }));
      })
      .catch((err) => {
        setSubmitError(err.message || 'Failed to delete image');
      });
  };

  const handleTracking = () => {
    onTracking()
  }

  useEffect(() => {
    if (
      existingImages &&
      typeof existingImages === 'object' &&
      existingImages.list &&
      Array.isArray(existingImages.list)
    ) {
      setImageList(existingImages);
    }
  }, [existingImages]);

  useEffect(() => {
    if (emptyTracking && (!initialData.trackingNumber || initialData.trackingNumber === '')) {
      setFormData((prev) => ({ ...prev, 'trackingNumber': emptyTracking }));
    }
  },[emptyTracking, initialData.trackingNumber]);

  useEffect(() => {
    if (initialData.user) setFormData(prev => ({ ...prev, user: initialData.user }));
  }, [initialData.user]);

  return (
    <div className="app-page app-form">
      <div className="app-card">
        <h1 className="text-2xl font-bold mb-4">
          {isEdit ? 'Edit' : 'Input New'} {basePath.charAt(1).toUpperCase() + basePath.slice(2).replace('-', ' ')} Item
        </h1>
        {!hideBackButton && (
          <button
            onClick={() => navigate(basePath)}
            className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Back
          </button>
        )}
        {no_tracking && (
          <button
            onClick={() => handleTracking()}
            className="mb-4 bg-yellow-500 text-white px-4 py-2 mx-2 rounded hover:bg-yellow-600"
          >
            No Tracking Number
          </button>
        )}
        <Toast message={submitError} type="error" onClose={() => setSubmitError('')} />
        <form ref={formRef} onSubmit={handleSubmit} aria-busy={submitting || deleting} noValidate>
          <fieldset disabled={submitting || deleting}>
          {visibleFields.map((field) => (
            <div key={field.name} className="mb-4">
              <label htmlFor={field.name} className="block text-gray-700 font-bold mb-2">{field.label}{field.required ? ' *' : ''}</label>
              {field.type === 'text' || field.type === 'date' || field.type === 'number' ? (
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] ?? ''}
                  disabled={field.disabled}
                  aria-required={field.required}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  min={field.min}
                  max={field.max}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder={field.placeholder}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  disabled={field.disabled}
                  aria-required={field.required}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {field.options.every(opt => opt.value !== '') && (
                    <option value="" disabled>
                      Select {field.label}
                    </option>
                  )}
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    checked={formData[field.name] || false}
                    disabled={field.disabled}
                    aria-invalid={!!errors[field.name]}
                    aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                    onChange={handleChange}
                    className="h-5 w-5"
                  />
                </div>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  disabled={field.disabled}
                  aria-required={field.required}
                  aria-invalid={!!errors[field.name]}
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 h-24"
                  placeholder={field.placeholder}
                  rows="5"
                />
              ) : field.type === 'file' ? (
                <>
                  <p className="text-sm text-gray-600 mb-2">JPEG or PNG, up to 5 photos and 4 MB per photo.</p>
                  {isEdit && (
                    <div className="mb-4">
                      <label className="block text-gray-700 font-bold mb-2">Current Images</label>
                      {imageList.list && imageList.list.length > 0 ? (
                        <div className="flex flex-wrap gap-4">
                          {imageList.list.map((filename, index) => (
                            <div key={index} className="relative w-32 h-32 rounded overflow-hidden group">
                              <img
                                src={`${API_SERVER}/images/${encodeURIComponent(imageList.type)}/${encodeURIComponent(imageList.type === 'non_laptop' ? formData.trackingNumber : itemId)}/${encodeURIComponent(filename)}`}
                                alt={`Attachment ${index + 1}`}
                                loading="lazy"
                                className="w-full h-full object-cover rounded-xl border"
                              />
                              {imageList.type !== 'non_laptop' && canPermission((basePath.startsWith('/pc') ? 'pc' : 'legacy') + '.photos') &&
                                <button
                                  type="button"
                                  onClick={() => handleImageDelete(filename, imageList.type)}
                                  className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 shadow-md"
                                  title="Delete image"
                                  aria-label={`Delete attachment ${index + 1}`}
                                >
                                  ✕
                                </button>
                              }
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No images available</p>
                      )}
                    </div>
                  )}
                  {imageList.type !== 'non_laptop' && canPermission(scope + '.photos') && (
                    field.capture && field.multiple ?
                      (
                        <>
                          {[...Array(initialData.image?.length || 1)].map((_, i) =>
                            <input
                              key={field.name + '_' + i}
                              type="file"
                              id={field.name + '_' + i}
                              name={field.name}
                              aria-label={`${field.label} ${i + 1}`}
                              accept="image/jpeg,image/png"
                              capture={field.capture}
                              onChange={(e) => handleMultiImagesChange(e, i)}
                              className="w-full p-2 border rounded"
                            />
                          )}
                        </>
                      ) :
                      <input
                        type="file"
                        id={field.name}
                        name={field.name}
                        multiple={field.multiple}
                        accept="image/jpeg,image/png"
                        capture={field.capture}
                        onChange={handleChange}
                        aria-invalid={!!errors[field.name]}
                        aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                        className="w-full p-2 border rounded"
                      />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData[field.name] && formData[field.name].length > 0 &&
                      Array.from(formData[field.name]).filter(file => file).map((file, index) => (
                        <ImagePreview key={index} file={file} index={index} />
                      ))}
                  </div>
                </>
              ) : null}
              {errors[field.name] && (
                <p id={`${field.name}-error`} role="alert" className="text-red-500 text-sm mt-1">{errors[field.name]}</p>
              )}
            </div>
          ))}
          <div className="app-actions">
            <button
              type="submit"
              disabled={submitting || deleting}
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : (isEdit ? 'Save Changes' : 'Submit')}
            </button>
            {isEdit && (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`${basePath}/${itemId}`)}
                  className="w-full sm:w-auto bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                {onDelete && <button
                  type="button"
                  hidden={!canPermission((basePath === '/pc' ? 'pc' : basePath === '/non-pc' ? 'nonpc' : 'legacy') + '.delete')} onClick={handleDeleteClick}
                  className="w-full sm:w-auto bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  {deleting ? 'Deleting...' : 'Delete Item'}
                </button>}
              </>
            )}
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

export default GenericForm;
