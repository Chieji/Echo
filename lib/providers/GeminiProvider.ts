import { Message, Provider, ToolDefinition } from '../types';

export class GeminiProvider implements Provider {
    name = 'google';
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model: string = 'gemini-2.0-flash-exp') {
        this.apiKey = apiKey;
        this.model = model;
    }

    async generateResponse(messages: Message[], tools?: ToolDefinition[]): Promise<Message> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        // Convert messages to Gemini format
        const contents = messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Extract system instruction
        const systemInstruction = messages.find(m => m.role === 'system')?.content;

        const body: any = {
            contents,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
            }
        };

        if (systemInstruction) {
            body.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        if (tools && tools.length > 0) {
            body.tools = [{
                functionDeclarations: tools
            }];
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API Error: ${JSON.stringify(error)}`);
        }

        const data = await response.json();
        const candidate = data.candidates[0];
        const part = candidate.content.parts[0];

        const result: Message = {
            role: 'assistant',
            content: part.text || ''
        };

        if (part.functionCall) {
            result.tool_calls = [{
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args)
                }
            }];
        }

        return result;
    }
}
