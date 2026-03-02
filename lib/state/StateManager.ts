import * as fs from 'fs/promises';
import * as path from 'path';
import { AppState } from '../types';

export class StateManager {
    private state: AppState;
    private stateFile: string;

    constructor(workspace: string) {
        const stateDir = path.join(workspace, 'data', 'state');
        this.stateFile = path.join(stateDir, 'state.json');
        this.state = { timestamp: new Date().toISOString() };
        
        // Ensure directory exists sync (simplified for initialization)
        const fsSync = require('fs');
        if (!fsSync.existsSync(stateDir)) {
            fsSync.mkdirSync(stateDir, { recursive: true });
        }
    }

    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf-8');
            this.state = JSON.parse(data);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error('[ECHO] Failed to load state:', error);
            }
        }
    }

    async setLastChannel(channel: string): Promise<void> {
        this.state.lastChannel = channel;
        this.state.timestamp = new Date().toISOString();
        await this.saveAtomic();
    }

    async setLastChatId(chatId: string): Promise<void> {
        this.state.lastChatId = chatId;
        this.state.timestamp = new Date().toISOString();
        await this.saveAtomic();
    }

    getState(): AppState {
        return { ...this.state };
    }

    private async saveAtomic(): Promise<void> {
        const tempFile = `${this.stateFile}.tmp`;
        const data = JSON.stringify(this.state, null, 2);

        try {
            await fs.writeFile(tempFile, data, 'utf-8');
            await fs.rename(tempFile, this.stateFile);
        } catch (error) {
            console.error('[ECHO] Atomic save failed:', error);
            try { await fs.unlink(tempFile); } catch {}
            throw error;
        }
    }
}
