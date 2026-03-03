import { Message, Provider, ToolDefinition } from '../types';

export class GeminiProvider implements Provider {
    name = 'google';
    private apiKey: string;
    private model: string;
    private embeddingModel: string;

    constructor(apiKey: string, model: string = 'gemini-2.0-flash-exp', embeddingModel: string = 'text-embedding-004') {
        this.apiKey = apiKey;
        this.model = model;
        this.embeddingModel = embeddingModel;
    }

    async generateResponse(messages: Message[], tools?: ToolDefinition[]): Promise<Message> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        // Convert messages to Gemini format
        const contents = messages.filter(m => m.role !== 'system').map(m => {
            if (m.role === 'tool') {
                return {
                    role: 'function',
                    parts: [{
                        functionResponse: {
                            name: messages.find(prev => prev.tool_calls?.some(tc => tc.id === m.tool_call_id))?.tool_calls?.find(tc => tc.id === m.tool_call_id)?.function.name || 'unknown',
                            response: { result: m.content }
                        }
                    }]
                };
            }

            const parts: any[] = [];
            if (m.content) {
                parts.push({ text: m.content });
            }

            if (m.tool_calls) {
                m.tool_calls.forEach(tc => {
                    parts.push({
                        functionCall: {
                            name: tc.function.name,
                            args: JSON.parse(tc.function.arguments)
                        }
                    });
                });
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        // Extract and combine ALL system instructions
        const systemInstructions = messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n\n');

        const body: any = {
            contents,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
            }
        };

        if (systemInstructions) {
            body.systemInstruction = {
                parts: [{ text: systemInstructions }]
            };
        }

        if (tools && tools.length > 0) {
            body.tools = [{
                functionDeclarations: tools
            }];
        }

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API Error: ${JSON.stringify(error)}`);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
             throw new Error(`Gemini API Error: No candidates returned. ${JSON.stringify(data)}`);
        }

        const candidate = data.candidates[0];
        const parts = candidate.content.parts;

        const result: Message = {
            role: 'assistant',
            content: ''
        };

        for (const part of parts) {
            if (part.text) {
                result.content += part.text;
            }
            if (part.functionCall) {
                if (!result.tool_calls) result.tool_calls = [];
                result.tool_calls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type: 'function',
                    function: {
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args)
                    }
                });
            }
        }

        return result;
    }

    async embedText(text: string): Promise<number[]> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`;

        const body = {
            model: `models/${this.embeddingModel}`,
            content: {
                parts: [{ text }]
            }
        };

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini Embedding Error: ${JSON.stringify(error)}`);
        }

        const data = await response.json();
        return data.embedding.values;
    }

    private async fetchWithRetry(url: string, options: any, retries: number = 3): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status === 429) {
                    const delay = Math.pow(2, i) * 1000;
                    console.warn(`[ECHO] Gemini API rate limited, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return fetch(url, options);
    }
}
