import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'

async function listenOnEphemeralPort(): Promise<{ port: number; close(): Promise<void> }> {
  const server = net.createServer()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address information.')
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    }
  }
}

test('resolvePreferredLocalPort keeps the requested port when it is free', async () => {
  const { resolvePreferredLocalPort } = await import('./local-port-resolver')
  const freeServer = await listenOnEphemeralPort()
  const preferredPort = freeServer.port
  await freeServer.close()

  const resolvedPort = await resolvePreferredLocalPort(preferredPort)

  assert.equal(resolvedPort, preferredPort)
})

test('resolvePreferredLocalPort falls back to a different free port when the preferred one is busy', async () => {
  const { resolvePreferredLocalPort } = await import('./local-port-resolver')
  const occupiedServer = await listenOnEphemeralPort()

  try {
    const resolvedPort = await resolvePreferredLocalPort(occupiedServer.port)

    assert.notEqual(resolvedPort, occupiedServer.port)
    assert.equal(Number.isInteger(resolvedPort), true)
    assert.equal(resolvedPort > 0, true)
  } finally {
    await occupiedServer.close()
  }
})
