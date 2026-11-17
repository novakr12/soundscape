"use client";

import Form from "next/form";
import { OPEN_FINDER } from "./finder";

export default function SearchBox() {
  return (
    <Form action="/search" role="search" className="search">
      <input
        type="search"
        name="q"
        placeholder="Search"
        aria-label="Search songs, artists, albums and users"
        aria-keyshortcuts="Control+K /"
        title="Quick search: Ctrl+K or /"
        onFocus={(event) => {
          const text = event.currentTarget.value;
          event.currentTarget.blur();
          window.dispatchEvent(new CustomEvent(OPEN_FINDER, { detail: text }));
        }}
      />
    </Form>
  );
}
