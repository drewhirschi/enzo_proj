import { AzureOpenAI } from "openai";
import { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { HierarchicalNSW } from 'hnswlib-node';
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

// import { parse } from "jsr:@std/csv";



export enum CompletionModels {
    gpt4o = "gpt-4o",
    gpt4oMini = "gpt-4o-mini",
    gpt4turbo = "gpt-4-turbo",
}

interface CompletionOptions {
    system: string;
    user: string;
    model?: CompletionModels;
    imageUrl?: string;
}

interface StructuredCompletionOptions<Z extends z.ZodTypeAny> extends CompletionOptions {
    schema: Z;
}

// const apiKey = Deno.env.get("OPENAI_API_KEY");
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
}


export function getOpenaiClient() {
    const deployment = 'gpt-4o';
    const apiVersion = "2024-08-01-preview";

    return new AzureOpenAI({
        apiKey,
        deployment,
        apiVersion,

    });
}

export async function getStructuredCompletion<Z extends z.ZodTypeAny = z.ZodNever>({
    model = CompletionModels.gpt4o,
    system,
    user,
    schema,
    imageUrl,
}: StructuredCompletionOptions<Z>): Promise<z.infer<Z> | null> {

    const deployment = model;
    const apiVersion = "2024-08-01-preview";

    const openai = new AzureOpenAI({
        apiKey,
        deployment,
        apiVersion,

    });

    try {
        const userMessageContent: Array<ChatCompletionContentPart> = [{ type: "text", text: user }];
        if (imageUrl) {
            userMessageContent.push({
                type: "image_url",
                image_url: { url: imageUrl },
            });
        }
        const response = await openai.beta.chat.completions.parse({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userMessageContent },
            ],
            response_format: zodResponseFormat(schema, "root"),
        });
        const responseParsed = response.choices[0].message.parsed;
        if (!responseParsed) {
            return null;
        }

        return responseParsed as z.infer<Z>;
    } catch (error) {
        console.error(error);
        return null;
    }
}



export async function getEmbedding(text: string, model: "small" | "large"): Promise<number[]> {
    const modelName = model === "small" ? "text-embedding-3-small" : "text-embedding-3-large";

    const openai = new AzureOpenAI({
        apiKey,
        apiVersion: "2023-05-15",
        deployment: modelName,
    });

    const embedding = await openai.embeddings.create({
        model: modelName,
        input: text,
    });

    return embedding.data[0].embedding;
}




export class EmbeddingIndex {

    private index: HierarchicalNSW;
    private idToPosition: Map<string, number>;
    private positionToId: Map<number, string>;
    private currentPosition: number;

    constructor(dimension: number, maxElements: number) {
        // Initialize the HNSW index
        this.index = new HierarchicalNSW('cosine', dimension);

        // Initialize the index with maximum number of elements
        this.index.initIndex(maxElements);

        // Store mapping of IDs to their positions in the index
        this.idToPosition = new Map();
        this.positionToId = new Map();
        this.currentPosition = 0;
    }

    // Add a single item to the index
    addItem(code: string, embedding: number[]) {
        // Add the embedding vector to the index
        this.index.addPoint(embedding, this.currentPosition);

        // Store the mappings
        this.idToPosition.set(code, this.currentPosition);
        this.positionToId.set(this.currentPosition, code);

        this.currentPosition++;
    }

    // Add multiple items at once
    addItems(items: { code: string, emb: number[] }[]) {
        items.forEach(item => {
            this.addItem(item.code, item.emb);
        });
    }

    // Search for nearest neighbors
    searchNearest(queryEmbedding: number[], k = 10) {
        // Get nearest neighbors
        const result = this.index.searchKnn(queryEmbedding, k);

        // Map the positions back to IDs and create result objects
        return {
            neighbors: result.neighbors.map((position, i) => ({
                code: this.positionToId.get(position),
                distance: result.distances[i]
            }))
        };
    }
}


export const dedupeByProperty = (property: string, arr: object[]) => {
    const map = new Map();
    arr.forEach(item => map.set(item[property], item));
    return Array.from(map.values());
};

