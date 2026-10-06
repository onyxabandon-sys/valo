'use client';

import { FormEvent, useEffect, useRef } from 'react';

export type DialogKind = 'location' | 'user' | 'device';
export type DialogMode = 'details' | 'edit' | 'delete' | 'add';

type EntityDialogProps = {
  kind: DialogKind;
  mode: DialogMode;
  record?: Record<string, string | number>;
  onClose: () => void;
  onSave?: (values: Record<string, string>) => void;
  onDelete?: () => void;
};

const fields: Record<DialogKind, { key: string; label: string; placeholder: string }[]> = {
  location: [
    { key: 'name', label: 'Location name', placeholder: 'North Gate' },
    { key: 'address', label: 'Address', placeholder: 'Street and city' },
  ],
  user: [
    { key: 'name', label: 'Full name', placeholder: 'Operator name' },
    { key: 'email', label: 'Email', placeholder: 'operator@example.com' },
    { key: 'location', label: 'Assigned location', placeholder: 'Select a location' },
  ],
  device: [
    { key: 'name', label: 'Device model', placeholder: 'Sunmi terminal' },
    { key: 'deviceId', label: 'Device identifier', placeholder: 'Identifier is masked in views' },
    { key: 'user', label: 'Assigned user', placeholder: 'Select an operator' },
    { key: 'location', label: 'Assigned location', placeholder: 'Select a location' },
  ],
};

const title: Record<DialogKind, string> = { location: 'location', user: 'user', device: 'device' };

const deleteExplanation: Record<DialogKind, string> = {
  location: 'Production location changes need server-side checks so linked users, devices, and receipt history stay intact.',
  user: 'This removes the sample user from the preview and releases their assigned device. No Convex data is changed.',
  device: 'In production, revoking a device blocks that assignment until an administrator assigns a device again.',
};

export function EntityDialog({ kind, mode, record, onClose, onSave, onDelete }: EntityDialogProps) {
  const firstField = useRef<HTMLInputElement>(null);
  const dialogElement = useRef<HTMLElement>(null);
  const isForm = mode === 'edit' || mode === 'add';
  const primaryValue = String(record?.name ?? record?.email ?? record?.deviceId ?? `${title[kind]} details`);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isForm) firstField.current?.focus();
    else dialogElement.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogElement.current) return;
      const focusable = Array.from(dialogElement.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) {
        event.preventDefault();
        dialogElement.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isForm, onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSave?.(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value).trim()])));
  };

  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section ref={dialogElement} className="dialog" aria-modal="true" aria-labelledby="dialog-title" role="dialog" tabIndex={-1}>
        <div className="dialog-head">
          <div>
            <h2 id="dialog-title">
              {mode === 'details' ? 'Details' : mode === 'delete' ? `${kind === 'user' ? 'Delete' : 'Deactivate'} ${title[kind]}?` : mode === 'add' ? `Add ${title[kind]}` : `Edit ${title[kind]}`}
            </h2>
            <p>{mode === 'delete'
              ? kind === 'user'
                ? 'This permanently removes the sample user from this local preview. No Convex data is changed.'
                : 'This preview keeps the record and marks it inactive. No Convex data is changed.'
              : 'Preview only. No Convex data is read or changed.'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>

        {mode === 'details' && record ? (
          <>
            <div className="primary-cell">{primaryValue}</div>
            <div className="detail-grid">
              {Object.entries(record).map(([key, value]) => (
                <div className="detail-item" key={key}>
                  <div className="detail-label">{key.replace(/[A-Z]/g, letter => ` ${letter}`).replace(/^./, letter => letter.toUpperCase())}</div>
                  <div className="detail-value">{String(value)}</div>
                </div>
              ))}
            </div>
            <div className="dialog-footer"><button className="secondary-button" onClick={onClose}>Close</button></div>
          </>
        ) : mode === 'delete' ? (
          <>
            <p className="delete-copy">You selected <strong>{primaryValue}</strong>. {deleteExplanation[kind]}</p>
            <div className="dialog-footer">
              <button className="secondary-button" onClick={onClose}>Cancel</button>
              <button className="danger-button" onClick={onDelete}>{kind === 'user' ? 'Delete from preview' : 'Deactivate in preview'}</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="form-stack">
              {fields[kind].map((field, index) => (
                <div className="field" key={field.key}>
                  <label htmlFor={`field-${field.key}`}>{field.label}</label>
                  <input
                    id={`field-${field.key}`}
                    ref={index === 0 ? firstField : undefined}
                    name={field.key}
                    required
                    defaultValue={record?.[field.key] ? String(record[field.key]) : ''}
                    placeholder={field.placeholder}
                    type={field.key === 'email' ? 'email' : 'text'}
                    autoComplete={field.key === 'email' ? 'email' : 'off'}
                  />
                </div>
              ))}
            </div>
            <div className="dialog-footer">
              <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
              <button className="primary-button" type="submit">{mode === 'add' ? 'Add to preview' : 'Save preview'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
