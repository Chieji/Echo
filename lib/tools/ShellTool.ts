import { Tool, ToolDefinition } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ShellTool implements Tool {
    definition: ToolDefinition = {
        name: 'execute_shell',
        description: 'Executes a shell command on the local system.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The command to execute'
                }
            },
            required: ['command']
        }
    };

    async execute(args: { command: string }): Promise<any> {
        try {
            const { stdout, stderr } = await execAsync(args.command);
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim()
            };
        } catch (error: any) {
            return {
                error: error.message,
                stdout: error.stdout?.trim(),
                stderr: error.stderr?.trim()
            };
        }
    }
}
