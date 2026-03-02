export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface Session {
    key: string;
    messages: Message[];
    summary?: string;
    created: string;
    updated: string;
}

export interface AppState {
    lastChannel?: string;
    lastChatId?: string;
    timestamp: string;
}

// --- Tool Interfaces ---

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface Tool {
    definition: ToolDefinition;
    execute(args: any): Promise<any>;
}

// --- Provider Interfaces ---

export interface Provider {
    name: string;
    generateResponse(messages: Message[], tools?: ToolDefinition[]): Promise<Message>;
}
