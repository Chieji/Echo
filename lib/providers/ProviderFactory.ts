import { Provider } from '../types';
import { GeminiProvider } from './GeminiProvider';

export class ProviderFactory {
    static create(providerName: string, apiKey: string, model?: string): Provider {
        switch (providerName.toLowerCase()) {
            case 'google':
            case 'gemini':
                return new GeminiProvider(apiKey, model);
            default:
                throw new Error(`Provider ${providerName} not supported`);
        }
    }
}
