import { Tool, ToolDefinition } from '../types';

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    register(tool: Tool): void {
        this.tools.set(tool.definition.name, tool);
        console.log(`[ECHO] Registered tool: ${tool.definition.name}`);
    }

    getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => t.definition);
    }

    async execute(name: string, args: string | object): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found`);
        }

        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        try {
            return await tool.execute(parsedArgs);
        } catch (error: any) {
            console.error(`[ECHO] Error executing tool ${name}:`, error);
            return { error: error.message };
        }
    }
}
