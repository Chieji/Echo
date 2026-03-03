import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { Message, Provider } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export class NeuralMemory {
    private db: Database;
    private provider: Provider;

    constructor(dbPath: string, provider: Provider) {
        this.provider = provider;

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
                CREATE TABLE IF NOT EXISTS memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_key TEXT,
                    role TEXT,
                    content TEXT,
                    embedding BLOB,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_session_key ON memory(session_key)`);
        });
    }

    async addMessage(sessionKey: string, message: Message): Promise<void> {
        // Only embed user and assistant messages for semantic search
        if (message.role !== 'user' && message.role !== 'assistant') {
            await this.saveMessage(sessionKey, message, null);
            return;
        }

        try {
            const embedding = await this.provider.embedText(message.content);
            await this.saveMessage(sessionKey, message, embedding);
        } catch (error) {
            console.error('[ECHO] Failed to generate embedding for memory:', error);
            await this.saveMessage(sessionKey, message, null);
        }
    }

    private saveMessage(sessionKey: string, message: Message, embedding: number[] | null): Promise<void> {
        return new Promise((resolve, reject) => {
            let embeddingBlob: Buffer | null = null;
            if (embedding) {
                const floatArray = new Float32Array(embedding);
                embeddingBlob = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
            }

            this.db.run(
                `INSERT INTO memory (session_key, role, content, embedding) VALUES (?, ?, ?, ?)`,
                [sessionKey, message.role, message.content, embeddingBlob],
                (err) => {
                    if (err) {
                        console.error('[ECHO] Database error in saveMessage:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async findSimilar(text: string, limit: number = 5): Promise<Message[]> {
        try {
            const queryEmbedding = await this.provider.embedText(text);
            // Optimization: Only retrieve the last 100 memories to avoid O(N) memory blowup
            // In a full production system, we would use a vector database (like sqlite-vss)
            const candidateMemories = await this.getCandidateEmbeddings(100);

            const scoredMemories = candidateMemories
                .map(m => ({
                    ...m,
                    score: this.cosineSimilarity(queryEmbedding, m.embedding)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);

            return scoredMemories.map(m => ({
                role: m.role as any,
                content: m.content
            }));
        } catch (error) {
            console.error('[ECHO] Semantic search failed:', error);
            return [];
        }
    }

    private getCandidateEmbeddings(limit: number): Promise<{role: string, content: string, embedding: number[]}[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT role, content, embedding FROM memory WHERE embedding IS NOT NULL ORDER BY timestamp DESC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const results = rows.map((row: any) => {
                            const buf = row.embedding as Buffer;
                            const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                            const floatArray = new Float32Array(arrayBuffer);
                            return {
                                role: row.role,
                                content: row.content,
                                embedding: Array.from(floatArray)
                            };
                        });
                        resolve(results);
                    }
                }
            );
        });
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    close() {
        this.db.close();
    }
}
