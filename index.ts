import { StateManager } from './lib/state/StateManager';
import { SessionManager } from './lib/session/SessionManager';
import { ToolRegistry } from './lib/tools/ToolRegistry';
import { ShellTool } from './lib/tools/ShellTool';
import { ProviderFactory } from './lib/providers/ProviderFactory';
import { AgentLoop } from './lib/agent/AgentLoop';
import { NeuralMemory } from './lib/memory/NeuralMemory';
import * as path from 'path';

async function main() {
    console.log('--- ECHO V2 AGENT ENGINE TEST ---');
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[ECHO] Error: GEMINI_API_KEY environment variable is required.');
        process.exit(1);
    }

    const workspace = process.cwd();
    
    // Initialize Core Components
    const stateManager = new StateManager(workspace);
    const sessionManager = new SessionManager(path.join(workspace, 'data', 'sessions.db'));
    const toolRegistry = new ToolRegistry();
    
    // Register Tools
    toolRegistry.register(new ShellTool());

    // Load State
    await stateManager.load();
    // await sessionManager.loadAll(); // SQLite version handles this internally

    // Initialize Engine
    const provider = ProviderFactory.create('gemini', apiKey);
    const memory = new NeuralMemory(path.join(workspace, 'data', 'memory.db'), provider);
    const agent = new AgentLoop(provider, toolRegistry, sessionManager, memory);

    const sessionKey = `session_${Date.now()}`;
    const prompt = "Check the current directory contents and tell me what files are there.";

    console.log(`[ECHO] Session: ${sessionKey}`);
    const result = await agent.run(sessionKey, prompt);

    console.log('\n--- AGENT RESPONSE ---');
    console.log(result);
    console.log('----------------------\n');

    await stateManager.setLastChannel('CLI');
    console.log('[ECHO] Final State:', stateManager.getState());
    console.log('--- TEST COMPLETE ---');
}

main().catch(console.error);
