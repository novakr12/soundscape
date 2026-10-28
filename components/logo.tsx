export const LOGO_AREA = "M14 47 L26 33 L36 43 L50 21 L59 47 Z";
export const LOGO_LINE = "M12 49 L25 34 L35 44 L51 22 L60 49";

export function logoSvg({ tile = true, id = "logo" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70">
  <defs>
    <linearGradient id="${id}-green" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#05B851"/>
      <stop offset="100%" stop-color="#00FF66"/>
    </linearGradient>
    <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  ${
    tile
      ? `<rect x="0.5" y="0.5" width="69" height="69" rx="16" fill="#0A0E14" stroke="#FFFFFF" stroke-opacity="0.14"/>`
      : `<rect width="70" height="70" fill="#0A0E14"/>`
  }
  <path class="logo-area" d="${LOGO_AREA}" fill="url(#${id}-green)" opacity="0.25"/>
  <path class="logo-line" d="${LOGO_LINE}" pathLength="1" stroke="url(#${id}-green)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#${id}-glow)"/>
  <circle class="logo-dot" cx="51" cy="22" r="3.5" fill="#00FF66"/>
</svg>`;
}

export default function Logo({ size = 24, id = "logo" }: { size?: number; id?: string }) {
  return (
    <span
      className="logo"
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: logoSvg({ id }) }}
    />
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Sound<span>scape</span>
    </span>
  );
}

export function Lockup({ animated = false, heading = false }: { animated?: boolean; heading?: boolean }) {
  return (
    <div className={animated ? "lockup animated" : "lockup"}>
      <Logo size={64} id="lockup" />
      <div>
        {heading ? (
          <h1>
            <Wordmark />
          </h1>
        ) : (
          <Wordmark />
        )}
        <span className="tagline">Music tracker</span>
      </div>
    </div>
  );
}
