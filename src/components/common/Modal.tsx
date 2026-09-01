import React, { useEffect, useRef, ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      style={{
        margin: 'auto',
        padding: 0,
        backgroundColor: 'var(--gc-surface)',
        color: 'var(--gc-text)',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius-lg)',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div className="flex flex-col gap-md" style={{ padding: 'var(--gc-space-md)' }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--gc-text-muted)',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >
            &times;
          </button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-sm" style={{ marginTop: 'var(--gc-space-sm)' }}>
            {footer}
          </div>
        )}
      </div>
      <style>{`
        dialog::backdrop {
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(2px);
        }
      `}</style>
    </dialog>
  );
};
