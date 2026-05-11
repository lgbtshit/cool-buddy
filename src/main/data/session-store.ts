import { app } from 'electron'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import Database from 'better-sqlite3'
import type {
  CreateSessionPayload,
  SessionGroup,
  SessionItem,
  SessionRecord
} from '../shared/types'

let database: Database.Database | null = null

function getSessionStatus(group: SessionGroup): SessionItem['status'] {
  if (group === 'production') return 'online'
  if (group === 'staging') return 'warning'
  return 'offline'
}

function getSessionIcon(group: SessionGroup): SessionItem['icon'] {
  if (group === 'production') return 'server'
  if (group === 'staging') return 'database'
  return 'hardDrive'
}

function mapSession(record: SessionRecord): SessionItem {
  return {
    id: record.id,
    name: record.name,
    group: record.group_name,
    host: record.host,
    port: record.port,
    username: record.username,
    password: record.password,
    status: getSessionStatus(record.group_name),
    icon: getSessionIcon(record.group_name)
  }
}

export function getDatabase(): Database.Database {
  if (database) {
    return database
  }

  const dataDir = join(app.getPath('home'), '.cool-buddy')
  mkdirSync(dataDir, { recursive: true })

  database = new Database(join(dataDir, 'cool-buddy.db'))
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `)

  return database
}

export function listSessions(): SessionItem[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT id, name, group_name, host, port, username, password, created_at
        FROM sessions
        ORDER BY datetime(created_at) ASC, rowid ASC
      `
    )
    .all() as SessionRecord[]

  return rows.map(mapSession)
}

export function createSession(payload: CreateSessionPayload): SessionItem {
  const trimmed = {
    name: payload.name.trim(),
    group: payload.group,
    host: payload.host.trim(),
    port: Number(payload.port),
    username: payload.username.trim(),
    password: payload.password
  }

  if (!trimmed.name || !trimmed.host || !trimmed.username || !trimmed.port) {
    throw new Error('Session fields are incomplete.')
  }

  const record: SessionRecord = {
    id: randomUUID(),
    name: trimmed.name,
    group_name: trimmed.group,
    host: trimmed.host,
    port: trimmed.port,
    username: trimmed.username,
    password: trimmed.password,
    created_at: new Date().toISOString()
  }

  getDatabase()
    .prepare(
      `
        INSERT INTO sessions (id, name, group_name, host, port, username, password, created_at)
        VALUES (@id, @name, @group_name, @host, @port, @username, @password, @created_at)
      `
    )
    .run(record)

  return mapSession(record)
}

export function deleteSession(sessionId: string): void {
  const trimmedId = sessionId.trim()
  if (!trimmedId) {
    throw new Error('Session id is required.')
  }

  getDatabase()
    .prepare(
      `
        DELETE FROM sessions
        WHERE id = ?
      `
    )
    .run(trimmedId)
}

export function closeDatabase(): void {
  database?.close()
  database = null
}
