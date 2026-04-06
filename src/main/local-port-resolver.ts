import net from 'node:net'

async function canListenOnPort(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function listenOnAnyPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve a free local port.'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}

export async function resolvePreferredLocalPort(preferredPort: number): Promise<number> {
  if (await canListenOnPort(preferredPort)) {
    return preferredPort
  }

  return listenOnAnyPort()
}
