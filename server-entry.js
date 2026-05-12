import 'dotenv/config'
import express from 'express'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './src/server/auth'
import { setupGate } from './src/server/middleware/setup-gate'
import setupRouter from './src/server/routes/setup'
import adminRouter from './src/server/routes/admin'

const CLIENT_DIR = join(__dirname, 'dist', 'client')

const port = parseInt(process.env.PORT || '3000', 10)
const host = process.env.HOST || '0.0.0.0'

const app = express()

app.use(express.json({ limit: '1mb' }))
app.set('trust proxy', 1)

app.all('/api/auth/*', toNodeHandler(auth))
app.use(setupGate)
app.use('/api/setup', setupRouter)
app.use('/api/admin', adminRouter)

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

async function tryServeStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)

  if (pathname.includes('..')) return false

  if (pathname.startsWith('/assets/')) {
    const filePath = join(CLIENT_DIR, pathname)
    if (!filePath.startsWith(CLIENT_DIR)) return false
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' })
      res.end('Asset not found')
      return true
    }
  }

  const filePath = join(CLIENT_DIR, pathname)
  if (!filePath.startsWith(CLIENT_DIR)) return false

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false

    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const data = await readFile(filePath)

    const headers = { 'Content-Type': contentType, 'Content-Length': data.length }
    if (pathname.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }

    res.writeHead(200, headers)
    res.end(data)
    return true
  } catch {
    return false
  }
}

let tanstackServer = null

function getTanstackServer() {
  if (!tanstackServer) {
    tanstackServer = require('./dist/server/server.js').default
  }
  return tanstackServer
}

async function requestHandler(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // Static assets: serve directly (GET/HEAD only)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const served = await tryServeStatic(req, res)
    if (served) return
  }

  // Express owns: better-auth, setup, admin — body not yet read, pass through directly
  if (
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/auth' ||
    pathname.startsWith('/api/setup') ||
    pathname.startsWith('/api/admin')
  ) {
    app(req, res)
    return
  }

  // TanStack handles everything else: all frontend routes + all other /api/* routes
  try {
    const server = getTanstackServer()

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
      else if (Array.isArray(value)) value.forEach(v => headers.append(key, v))
    }

    let bodyInit
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      bodyInit = await new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
      })
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: bodyInit && bodyInit.length ? bodyInit : undefined,
    })

    const response = await server.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value)
    })

    if (response.body) {
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
      } finally {
        res.end()
      }
    } else {
      res.end()
    }
    return
  } catch (err) {
    console.error('[TanStack] Error handling request:', err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'internal_error' }))
    }
  }
}

const httpServer = createServer(requestHandler)

if (process.env.SKIP_SERVER !== '1') {
  httpServer.listen(port, host, () => {
    console.log(`Hermes Workspace running at http://${host}:${port}`)
  })
}

export { app }
export default app
