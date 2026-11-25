type IconProps = { size?: number };

function Icon({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </Icon>
  );
}

export function PreviousIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.55.83L9.2 13.1a1.3 1.3 0 0 1 0-2.2l8.25-5.53A1 1 0 0 1 19 6.2z" />
    </Icon>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83l8.25-5.53a1.3 1.3 0 0 0 0-2.2L6.55 5.37A1 1 0 0 0 5 6.2z" />
    </Icon>
  );
}

function Line({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ShuffleIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H20" />
      <path d="M3 17h3.5c1.3 0 2.3-.4 3.1-1.2M13.4 8.2c.8-.8 1.8-1.2 3.1-1.2H20" />
      <path d="M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />
    </Line>
  );
}

export function RepeatIcon({ one, ...props }: IconProps & { one?: boolean }) {
  return (
    <Line {...props}>
      <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19M16.5 4.5 19 7l-2.5 2.5" />
      <path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5M7.5 19.5 5 17l2.5-2.5" />
      {one && <path d="M11.3 10.8 12.5 10v4" strokeWidth="1.6" />}
    </Line>
  );
}

export function QueueIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6h12M4 11h12M4 16h7" />
      <path d="M15 14.5v5l4-2.5z" fill="currentColor" strokeWidth="1.2" />
    </Line>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

export function LyricsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="11" height="2" rx="1" />
      <rect x="3" y="10" width="11" height="2" rx="1" />
      <rect x="3" y="15" width="7" height="2" rx="1" />
      <path d="M18 4.5v9.3a2.7 2.7 0 1 0 2 2.6V8h2V4.5z" />
    </Icon>
  );
}

export function DevicesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5V7h-2V6H5v8h7v2H4.5A1.5 1.5 0 0 1 3 14.5zM7 18h5v2H7z" />
      <path d="M15 9h5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm1 2v7h3v-7zm1.5 7.25a.75.75 0 1 0 0-.01z" />
    </Icon>
  );
}

export function SpeakerIcon({ level, size = 20 }: IconProps & { level: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" strokeLinejoin="round" />
      {level === 0 ? (
        <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
          {level > 0.5 && <path d="M19 7a7 7 0 0 1 0 10" strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}

export function HeartIcon({ filled = false, size = 18 }: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.4l-1.35-1.23C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.65 11.68L12 20.4z" />
    </svg>
  );
}

export function PlayNextIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6h10M4 12h16M4 18h16" />
      <path d="M17 4.5v5l4-2.5z" fill="currentColor" strokeWidth="1.2" />
    </Line>
  );
}

export function QueueAddIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6h12M4 11h12M4 16h7" />
      <path d="M17 13v6M14 16h6" />
    </Line>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6" />
    </Line>
  );
}

export function FullscreenIcon({ active = false, ...props }: IconProps & { active?: boolean }) {
  return (
    <Line {...props}>
      {active ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </Line>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Line>
  );
}
