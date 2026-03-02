import * as fs from 'fs/promises';
import * as path from 'path';
import { Message, Session } from '../types';

export class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private storageDir: string;

    constructor(storageDir: string) {
        this.storageDir = storageDir;
        
        const fsSync = require('fs');
        if (!fsSync.existsSync(this.storageDir)) {
            fsSync.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    async loadAll(): Promise<void> {
        try {
            const files = await fs.readdir(this.storageDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const data = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
                    const session: Session = JSON.parse(data);
                    this.sessions.set(session.key, session);
                }
            }
        } catch (error) {
            console.error('[ECHO] Failed to load sessions:', error);
        }
    }

    getOrCreate(key: string): Session {
        let session = this.sessions.get(key);
        if (!session) {
            session = {
                key,
                messages: [],
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
            this.sessions.set(key, session);
        }
        return session;
    }

    async addMessage(key: string, message: Message): Promise<void> {
        const session = this.getOrCreate(key);
        session.messages.push(message);
        session.updated = new Date().toISOString();
        await this.saveAtomic(key);
    }

    getHistory(key: string): Message[] {
        return this.sessions.get(key)?.messages || [];
    }

    private async saveAtomic(key: string): Promise<void> {
        const session = this.sessions.get(key);
        if (!session) return;

        const filename = key.replace(/[:/\\\\]/g, '_') + '.json';
        const filePath = path.join(this.storageDir, filename);
        const tempFile = `${filePath}.tmp`;
        const data = JSON.stringify(session, null, 2);

        try {
            await fs.writeFile(tempFile, data, 'utf-8');
            await fs.rename(tempFile, filePath);
        } catch (error) {
            console.error(`[ECHO] Failed to save session ${key}:`, error);
            try { await fs.unlink(tempFile); } catch {}
        }
    }
}
