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
