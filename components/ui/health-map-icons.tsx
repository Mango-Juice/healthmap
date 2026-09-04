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
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
    </Icon>
  )
}

export function FilterIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M4 7h7m4 0h5M4 17h3m4 0h9" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
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

export function ArrowUpRightIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M7 7h10v10M7 17 17 7" />
    </Icon>
  )
}

export function PlusIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
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

export function ChevronRightIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function ArrowLeftIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h10" />
    </Icon>
  )
}

export function WheatIcon({ className }: NamedIconProperties) {
  return (
    <Icon className={className}>
      <path d="M2 22 16 8" />
      <path d="M16 8c-4 0-6-2-7-5 4 0 6 2 7 5Z" />
      <path d="M13 11c0-4 2-6 5-7 0 4-2 6-5 7Z" />
      <path d="M10 14c-4 0-6-2-7-5 4 0 6 2 7 5Z" />
      <path d="M7 17c0-4 2-6 5-7 0 4-2 6-5 7Z" />
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
