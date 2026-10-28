"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Request = {
  title: string;
  message?: string;
  confirmLabel: string;
  resolve: (answer: boolean) => void;
};

type Options = { message?: string; confirmLabel?: string };

function ConfirmDialog({ request, onClose }: { request: Request; onClose: (answer: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(false);
      }}
    >
      <h2 id="confirm-title">{request.title}</h2>
      {request.message && <p className="muted">{request.message}</p>}
      <div className="confirm-actions">
        <button type="button" onClick={() => onClose(false)} autoFocus>
          Cancel
        </button>
        <button type="button" className="danger-button" onClick={() => onClose(true)}>
          {request.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);

  function confirm(title: string, { message, confirmLabel = "Delete" }: Options = {}) {
    return new Promise<boolean>((resolve) => setRequest({ title, message, confirmLabel, resolve }));
  }

  function close(answer: boolean) {
    request?.resolve(answer);
    setRequest(null);
  }

  const dialog = request ? createPortal(<ConfirmDialog request={request} onClose={close} />, document.body) : null;
  return [confirm, dialog] as const;
}
