function IconBase({ className, children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
      <circle cx="12" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function PlayCardIcon({ className }) {
  return (
    <IconBase className={className}>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M12 9.2 13.2 12 16 13.2 13.2 14.4 12 17.2 10.8 14.4 8 13.2 10.8 12z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function TrophyIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5a3 3 0 0 0 3 3" />
      <path d="M16 5h3a3 3 0 0 1-3 3" />
      <path d="M12 12v3.5" />
      <path d="M9.5 20h5" />
      <path d="M10 16.5h4l0.9 3.5H9.1z" />
    </IconBase>
  );
}

export function WalletIcon({ className }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <circle cx="17" cy="14.2" r="1.3" fill="currentColor" stroke="none" />
    </IconBase>
  );
}
