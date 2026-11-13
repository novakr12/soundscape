"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function Snippet({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (value) setCopied(false);
  }, [value]);

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      event.currentTarget.parentElement?.querySelector("input")?.select();
    }
  }

  return (
    <label className="snippet">
      {label}
      <span className="invite-link">
        <input value={value} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    </label>
  );
}

export default function NowPlayingShare({ username }: { username: string }) {
  const [origin, setOrigin] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    setOrigin(window.location.origin);
    setStamp(Date.now());
  }, []);

  const path = `/u/${encodeURIComponent(username)}/now-playing.png${theme === "light" ? "?theme=light" : ""}`;
  const image = `${origin}${path}`;
  const profile = `${origin}/u/${encodeURIComponent(username)}`;
  const alt = `What ${username} is listening to on Soundscape`;

  return (
    <div className="stack now-playing-share">
      <fieldset className="theme-choice">
        <legend>Look</legend>
        {(["dark", "light"] as const).map((option) => (
          <label key={option}>
            <input type="radio" name="now-playing-theme" checked={theme === option} onChange={() => setTheme(option)} />{" "}
            {option === "dark" ? "Dark" : "Light"}
          </label>
        ))}
      </fieldset>
      {stamp > 0 && (
        <img
          src={`${path}${path.includes("?") ? "&" : "?"}preview=${stamp}`}
          alt={alt}
          width={440}
          height={110}
          className="now-playing-preview"
        />
      )}
      {origin && (
        <>
          <Snippet label="Markdown, for a GitHub profile" value={`[![${alt}](${image})](${profile})`} />
          <Snippet
            label="HTML, for a website"
            value={`<a href="${profile}"><img src="${image}" alt="${alt}" width="440" height="110"></a>`}
          />
          <Snippet label="BBCode, for forums" value={`[url=${profile}][img]${image}[/img][/url]`} />
          <Snippet label="Image address" value={image} />
        </>
      )}
    </div>
  );
}
