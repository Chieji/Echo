import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { Message, Session } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export class SessionManager {
    private db: Database;

    constructor(dbPath: string) {
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    private init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    key TEXT PRIMARY KEY,
                    created TEXT,
                    updated TEXT
                )
            `);
            this.db.run(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_key TEXT,
                    role TEXT,
                    content TEXT,
                    tool_calls TEXT,
                    tool_call_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_key) REFERENCES sessions(key)
                )
            `);
        });
    }

    async loadAll(): Promise<void> {
        // SQLite version handles this internally
    }

    async getOrCreate(key: string): Promise<Session> {
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT * FROM sessions WHERE key = ?`, [key], (err, row: any) => {
                if (err) return reject(err);
                if (row) {
                    this.getHistory(key).then(messages => {
                        resolve({
                            key: row.key,
                            created: row.created,
                            updated: row.updated,
                            messages
                        });
                    }).catch(reject);
                } else {
                    const now = new Date().toISOString();
                    this.db.run(
                        `INSERT INTO sessions (key, created, updated) VALUES (?, ?, ?)`,
                        [key, now, now],
                        (err) => {
                            if (err) return reject(err);
                            resolve({
                                key,
                                created: now,
                                updated: now,
                                messages: []
                            });
                        }
                    );
                }
            });
        });
    }

    async addMessage(key: string, message: Message): Promise<void> {
        await this.getOrCreate(key);
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            this.db.serialize(() => {
                let hasError = false;
                this.db.run(
                    `INSERT INTO messages (session_key, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)`,
                    [
                        key,
                        message.role,
                        message.content,
                        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
                        message.tool_call_id
                    ],
                    (err) => {
                        if (err) {
                            hasError = true;
                            reject(err);
                        }
                    }
                );
                this.db.run(
                    `UPDATE sessions SET updated = ? WHERE key = ?`,
                    [now, key],
                    (err) => {
                        if (!hasError) {
                            if (err) reject(err);
                            else resolve();
                        }
                    }
                );
            });
        });
    }

    async getHistory(key: string): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT role, content, tool_calls, tool_call_id FROM messages WHERE session_key = ? ORDER BY id ASC`,
                [key],
                (err, rows: any[]) => {
                    if (err) return reject(err);
                    resolve(rows.map(row => ({
                        role: row.role as any,
                        content: row.content,
                        tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
                        tool_call_id: row.tool_call_id || undefined
                    })));
                }
            );
        });
    }

    close() {
        this.db.close();
    }
}
