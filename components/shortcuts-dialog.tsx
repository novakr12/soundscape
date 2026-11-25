"use client";

import { useEffect, useRef } from "react";

type Entry = {
  action: string;
  keys: React.ReactNode;
};

const GROUPS: { heading: string; items: Entry[] }[] = [
  {
    heading: "Playback",
    items: [
      { action: "Play / pause", keys: <kbd>Space</kbd> },
      {
        action: "Seek back / forward 5s",
        keys: (
          <>
            <kbd>←</kbd> / <kbd>→</kbd>
          </>
        ),
      },
      {
        action: "Previous / next song",
        keys: (
          <>
            <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>Shift</kbd>+<kbd>→</kbd>
          </>
        ),
      },
      { action: "Mute / unmute", keys: <kbd>M</kbd> },
      {
        action: "Volume up / down 5%",
        keys: (
          <>
            <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Shift</kbd>+<kbd>↓</kbd>
          </>
        ),
      },
      { action: "Toggle shuffle", keys: <kbd>S</kbd> },
      { action: "Cycle repeat", keys: <kbd>R</kbd> },
    ],
  },
  {
    heading: "Panels & navigation",
    items: [
      { action: "Toggle queue", keys: <kbd>Q</kbd> },
      { action: "Toggle lyrics", keys: <kbd>L</kbd> },
      {
        action: "Quick finder",
        keys: (
          <>
            <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd>
          </>
        ),
      },
      { action: "Keyboard shortcuts", keys: <kbd>?</kbd> },
    ],
  },
  {
    heading: "Quick finder",
    items: [
      { action: "Open result", keys: <kbd>Enter</kbd> },
      {
        action: "Play song now",
        keys: (
          <>
            <kbd>Shift</kbd>+<kbd>Enter</kbd>
          </>
        ),
      },
      {
        action: "Play song next",
        keys: (
          <>
            <kbd>Alt</kbd>+<kbd>Enter</kbd>
          </>
        ),
      },
      {
        action: "Add song to queue",
        keys: (
          <>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
          </>
        ),
      },
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    const pressed = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" ||
        (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat)
      ) {
        event.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog shortcuts-dialog"
      aria-labelledby="shortcuts-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="shortcuts-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="secondary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
      {GROUPS.map((group) => (
        <section key={group.heading} className="shortcuts-group">
          <h3>{group.heading}</h3>
          <dl className="shortcuts-list">
            {group.items.map((item) => (
              <div key={item.action} className="shortcuts-row">
                <dt>{item.action}</dt>
                <dd>{item.keys}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </dialog>
  );
}
