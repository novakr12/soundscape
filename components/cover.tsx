export default function Cover({
  src,
  large = false,
  round = false,
}: {
  src?: string;
  large?: boolean;
  round?: boolean;
}) {
  const className = `cover${large ? " large" : ""}${round && src ? " round" : ""}`;
  const size = large ? 128 : 40;
  if (src) return <img className={className} src={src} alt="" width={size} height={size} />;

  return (
    <span className={`${className} cover-fallback`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={large ? 64 : 22} height={large ? 64 : 22} fill="currentColor" aria-hidden="true">
        <path d="M8.2 6.4 19.8 3.2v3.4L8.2 9.8z" />
        <rect x="8.2" y="6.4" width="1.6" height="11" />
        <rect x="18.2" y="3.4" width="1.6" height="12" />
        <ellipse cx="6.6" cy="17.3" rx="3.1" ry="2.4" transform="rotate(-20 6.6 17.3)" />
        <ellipse cx="16.6" cy="15.3" rx="3.1" ry="2.4" transform="rotate(-20 16.6 15.3)" />
      </svg>
    </span>
  );
}
