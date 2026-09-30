export type PlayerIconName = "play" | "pause" | "replay" | "previous" | "next" | "locate" | "close";

interface IProps {
  name: PlayerIconName;
}

export function PlayerIcon({ name }: IProps) {
  return (
    <svg
      className="saystack-player__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "play" && <path d="M8 5.8v12.4a1 1 0 0 0 1.53.85l9.7-6.2a1 1 0 0 0 0-1.7l-9.7-6.2A1 1 0 0 0 8 5.8z" fill="currentColor" stroke="none" />}
      {name === "pause" && (
        <>
          <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
          <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "replay" && (
        <>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <path d="M4.5 4.5v4h4" />
        </>
      )}
      {name === "previous" && (
        <>
          <path d="M6.5 6v12" />
          <path d="M18 7v10a1 1 0 0 1-1.55.83l-7.1-5a1 1 0 0 1 0-1.66l7.1-5A1 1 0 0 1 18 7z" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "next" && (
        <>
          <path d="M17.5 6v12" />
          <path d="M6 7v10a1 1 0 0 0 1.55.83l7.1-5a1 1 0 0 0 0-1.66l-7.1-5A1 1 0 0 0 6 7z" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "locate" && (
        <>
          <circle cx="12" cy="12" r="6.5" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "close" && <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
    </svg>
  );
}
