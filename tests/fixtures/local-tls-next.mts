import { spawn } from "node:child_process"
import { existsSync, type FSWatcher, watch } from "node:fs"
import { dirname, join } from "node:path"
import { z } from "zod"
import { localTlsCertificatePath } from "./local-tls-runtime.mts"

const EnvironmentSchema = z.object({
  LOCAL_TLS_ROOT: z.string().min(1),
  PLAYWRIGHT_PORT: z.string().regex(/^[1-9]\d{0,4}$/u),
})

const waitForCertificate = async (root: string): Promise<string> => {
  const certificatePath = localTlsCertificatePath(root)
  if (existsSync(certificatePath)) return certificatePath
  return await new Promise((resolve, reject) => {
    let rootWatcher: FSWatcher | undefined
    const parentWatcher = watch(dirname(root), { persistent: false }, () => attachRootWatcher())
    const timeout = setTimeout(() => finish(new Error("Local TLS certificate timed out")), 30_000)
    const finish = (error?: Error): void => {
      clearTimeout(timeout)
      parentWatcher.close()
      rootWatcher?.close()
      if (error === undefined) resolve(certificatePath)
      else reject(error)
    }
    const check = (): void => {
      if (existsSync(certificatePath)) finish()
    }
    const attachRootWatcher = (): void => {
      if (rootWatcher !== undefined || !existsSync(root)) return
      rootWatcher = watch(root, { persistent: false }, check)
      check()
    }
    attachRootWatcher()
  })
}

const main = async (): Promise<void> => {
  const environment = EnvironmentSchema.parse(process.env)
  const port = Number.parseInt(environment.PLAYWRIGHT_PORT, 10)
  if (port > 65_535) throw new Error("PLAYWRIGHT_PORT must be a TCP port")
  const certificatePath = await waitForCertificate(environment.LOCAL_TLS_ROOT)
  const child = spawn(
    process.execPath,
    [
      join(process.cwd(), "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: { ...process.env, NODE_EXTRA_CA_CERTS: certificatePath },
      stdio: "inherit",
    },
  )
  process.once("SIGINT", () => child.kill("SIGINT"))
  process.once("SIGTERM", () => child.kill("SIGTERM"))
  const exitCode = await new Promise<number>((resolve) => {
    child.once("exit", (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
}

await main()
