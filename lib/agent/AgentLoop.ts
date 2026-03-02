import { SessionManager } from '../session/SessionManager';
import { ToolRegistry } from '../tools/ToolRegistry';
import { Provider } from '../types';

export class AgentLoop {
    private provider: Provider;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;

    constructor(provider: Provider, toolRegistry: ToolRegistry, sessionManager: SessionManager) {
        this.provider = provider;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
    }

    async run(sessionKey: string, userPrompt: string): Promise<string> {
        console.log(`[ECHO] Processing prompt: ${userPrompt}`);
        
        // 1. Add user message to session
        await this.sessionManager.addMessage(sessionKey, {
            role: 'user',
            content: userPrompt
        });

        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            iteration++;
            
            // 2. Load current history
            const history = this.sessionManager.getHistory(sessionKey);
            const tools = this.toolRegistry.getToolDefinitions();

            // 3. Generate LLM response
            const response = await this.provider.generateResponse(history, tools);
            
            // 4. Handle response
            if (response.tool_calls && response.tool_calls.length > 0) {
                // Add assistant message with tool calls to history
                await this.sessionManager.addMessage(sessionKey, response);

                for (const call of response.tool_calls) {
                    console.log(`[ECHO] Tool Call: ${call.function.name}(${call.function.arguments})`);
                    
                    // Execute tool
                    const result = await this.toolRegistry.execute(call.function.name, call.function.arguments);
                    
                    // Add tool result to history
                    await this.sessionManager.addMessage(sessionKey, {
                        role: 'tool',
                        content: JSON.stringify(result),
                        tool_call_id: call.id
                    });
                }
                // Continue loop to let LLM process tool results
            } else {
                // Final response
                await this.sessionManager.addMessage(sessionKey, response);
                return response.content;
            }
        }

        return "Maximum iterations reached without final response.";
    }
}
