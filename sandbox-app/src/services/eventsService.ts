import { Credentials } from "@aws-sdk/client-cognito-identity";
import { signedFetch } from "./mqttService";

const EVENTS_API_URL = 'https://api.bootboots.sandbox.nakomis.com/events';

export interface ClaudeResult {
    cat: string;
    confidence: string;
    reasoning: string;
}

export interface CatcamEvent {
    id: string;
    timestamp: string;
    imageName: string;
    bootsConfidence: number;
    imageUrl: string | null;
    claudeResult?: ClaudeResult;
}

export async function getEvents(
    credentials: Credentials,
    minConfidence: number = 0.5
): Promise<CatcamEvent[]> {
    const url = `${EVENTS_API_URL}?minConfidence=${minConfidence}`;
    const response = await signedFetch(url, credentials);

    if (!response.ok) {
        throw new Error(`Events API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}
