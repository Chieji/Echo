import { SessionManager } from '../session/SessionManager';
import { ToolRegistry } from '../tools/ToolRegistry';
import { Provider, Message } from '../types';
import { NeuralMemory } from '../memory/NeuralMemory';

export class AgentLoop {
    private provider: Provider;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private memory?: NeuralMemory;

    constructor(provider: Provider, toolRegistry: ToolRegistry, sessionManager: SessionManager, memory?: NeuralMemory) {
        this.provider = provider;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.memory = memory;
    }

    async run(sessionKey: string, userPrompt: string): Promise<string> {
        console.log(`[ECHO] Processing prompt: ${userPrompt}`);
        
        const userMessage: Message = {
            role: 'user',
            content: userPrompt
        };

        // 2b. Inject semantic memory if available - DO THIS BEFORE adding current message to memory
        let memoryContext = "";
        if (this.memory) {
            const similarMemories = await this.memory.findSimilar(userPrompt);
            if (similarMemories.length > 0) {
                memoryContext = "Relevant background information from memory:\n" +
                    similarMemories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
            }
        }

        // 1. Add user message to session and memory
        await this.sessionManager.addMessage(sessionKey, userMessage);
        if (this.memory) {
            await this.memory.addMessage(sessionKey, userMessage);
        }

        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            iteration++;
            
            // 2. Load current history
            const history = await this.sessionManager.getHistory(sessionKey);

            let augmentedHistory = history;
            if (memoryContext) {
                // Keep memory context in every iteration for this prompt's loop
                augmentedHistory = [
                    { role: 'system', content: memoryContext },
                    ...history
                ];
            }

            const tools = this.toolRegistry.getToolDefinitions();

            // 3. Generate LLM response
            const response = await this.provider.generateResponse(augmentedHistory, tools);
            
            // 4. Handle response
            if (response.tool_calls && response.tool_calls.length > 0) {
                // Add assistant message with tool calls to history
                await this.sessionManager.addMessage(sessionKey, response);

                for (const call of response.tool_calls) {
                    console.log(`[ECHO] Tool Call: ${call.function.name}(${call.function.arguments})`);
                    
                    // Execute tool
                    const result = await this.toolRegistry.execute(call.function.name, call.function.arguments);
                    
                    const toolMessage: Message = {
                        role: 'tool',
                        content: JSON.stringify(result),
                        tool_call_id: call.id
                    };

                    // Add tool result to history
                    await this.sessionManager.addMessage(sessionKey, toolMessage);
                }
                // Continue loop to let LLM process tool results
            } else {
                // Final response
                await this.sessionManager.addMessage(sessionKey, response);
                if (this.memory) {
                    await this.memory.addMessage(sessionKey, response);
                }
                return response.content;
            }
        }

        return "Maximum iterations reached without final response.";
    }
}
