import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:https"
import { tmpdir } from "node:os"
import { basename, join, relative, resolve } from "node:path"

type LocalTlsOptions = Readonly<{
  opensslCommand?: string
  root?: string
}>

export type LocalTlsMaterial = Readonly<{
  certificate: Buffer
  certificatePath: string
  cleanup: () => void
  privateKey: Buffer
  privateKeyPath: string
  root: string
}>

export class LocalTlsSetupError extends Error {
  readonly stage: "generate" | "path"

  constructor(stage: "generate" | "path") {
    super(
      stage === "generate"
        ? "Local TLS generation failed: install the OpenSSL CLI and ensure it can create a localhost certificate"
        : "Local TLS path validation failed",
    )
    this.name = "LocalTlsSetupError"
    this.stage = stage
  }
}

const assertOwnedRoot = (root: string): string => {
  const absoluteRoot = resolve(root)
  const relativeRoot = relative(resolve(tmpdir()), absoluteRoot)
  if (
    relativeRoot.startsWith("..") ||
    relativeRoot === "" ||
    !basename(absoluteRoot).startsWith("healthmap-local-tls-")
  )
    throw new LocalTlsSetupError("path")
  return absoluteRoot
}

export const localTlsCertificatePath = (root: string): string =>
  join(assertOwnedRoot(root), "certificate.pem")

export const createLocalTlsMaterial = (options: LocalTlsOptions = {}): LocalTlsMaterial => {
  const root = assertOwnedRoot(options.root ?? mkdtempSync(join(tmpdir(), "healthmap-local-tls-")))
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const certificatePath = join(root, "certificate.pem")
  const privateKeyPath = join(root, "private-key.pem")
  const cleanup = (): void => rmSync(root, { force: true, recursive: true })
  const generated = spawnSync(
    options.opensslCommand ?? "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-days",
      "1",
      "-nodes",
      "-keyout",
      privateKeyPath,
      "-out",
      certificatePath,
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  )
  if (generated.status !== 0) {
    cleanup()
    throw new LocalTlsSetupError("generate")
  }
  chmodSync(privateKeyPath, 0o600)
  return {
    certificate: readFileSync(certificatePath),
    certificatePath,
    cleanup,
    privateKey: readFileSync(privateKeyPath),
    privateKeyPath,
    root,
  }
}

export const bindLocalTlsCleanup = (server: Server, material: LocalTlsMaterial): void => {
  const shutdown = (): void => {
    server.close(() => {
      material.cleanup()
      process.exit(0)
    })
  }
  server.once("close", material.cleanup)
  process.once("exit", material.cleanup)
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}
