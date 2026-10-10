import React, { useEffect, useRef, ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

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
      className="glass-panel"
      style={{
        margin: 'auto',
        padding: 0,
        backgroundColor: 'rgba(20, 20, 23, 0.92)',
        color: 'var(--gc-text)',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius-lg)',
        width: '100%',
        maxWidth: '440px',
        boxShadow: 'var(--gc-shadow-lg)',
        outline: 'none',
      }}
    >
      <div className="flex flex-col gap-md" style={{ padding: '20px' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--gc-border)', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.2px' }}>{title}</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{
              padding: '3px 6px',
              border: 'none',
              borderRadius: 'var(--gc-radius-sm)',
              color: 'var(--gc-text-muted)',
              cursor: 'pointer',
            }}
            title="Close"
          >
            <LuX size={15} />
          </button>
        </div>
        <div style={{ padding: '4px 0' }}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-sm" style={{ marginTop: 'var(--gc-space-sm)', paddingTop: '12px', borderTop: '1px solid var(--gc-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
};
