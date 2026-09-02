import type { ReactNode } from "react"

type IconProperties = {
  readonly className?: string | undefined
  readonly children: ReactNode
}

function Icon({ children, className }: IconProperties) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  )
}

type NamedIconProperties = {
  readonly className?: string | undefined
}

export function AlertTriangleIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  )
}

export function LeafIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 18 2 18 2c1 6-1 12-7 14" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6.94C9.4 12.93 12.16 12 16 12" />
    </Icon>
  )
}

export function LoaderIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </Icon>
  )
}

export function LocateIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Icon>
  )
}

export function MapPinIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2" />
    </Icon>
  )
}

export function NavigationIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="m3 11 19-9-9 19-2-8-8-2Z" />
    </Icon>
  )
}

export function RotateCcwIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  )
}

export function SearchIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  )
}

export function ChevronDownIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function XIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}
