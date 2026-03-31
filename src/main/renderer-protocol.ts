import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { protocol } from 'electron'

import { buildProductionContentSecurityPolicy } from './security'

if (protocol?.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.map':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export function createRendererResponseHeaders(filePath: string): Headers {
  const headers = new Headers({
    'content-type': contentTypeFor(filePath)
  })

  if (path.extname(filePath) === '.html') {
    headers.set('content-security-policy', buildProductionContentSecurityPolicy())
  }

  return headers
}

function resolveRendererFilePath(rendererRoot: string, requestUrl: string): string | null {
  const url = new URL(requestUrl)
  if (url.hostname !== 'renderer') {
    return null
  }

  const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const normalizedRoot = path.normalize(rendererRoot)
  const resolvedPath = path.normalize(path.join(normalizedRoot, relativePath))

  if (resolvedPath !== normalizedRoot && !resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    return null
  }

  return resolvedPath
}

export function registerRendererProtocol(rendererRoot: string): void {
  protocol.handle('app', async (request) => {
    const filePath = resolveRendererFilePath(rendererRoot, request.url)

    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    try {
      const body = await readFile(filePath)
      const headers = createRendererResponseHeaders(filePath)
      return new Response(body, {
        status: 200,
        headers
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Response('Not found', { status: 404 })
      }

      return new Response('Internal Server Error', { status: 500 })
    }
  })
}
