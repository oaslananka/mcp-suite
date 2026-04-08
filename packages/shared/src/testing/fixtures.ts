import { Tool, Resource, Prompt, ContentBlock } from "../protocol/types.js";

export const FIXTURES = {
    MOCK_TOOL: {
        name: "mock_tool",
        description: "A mock tool for testing",
        inputSchema: {
            type: "object",
            properties: {
                testArg: { type: "string" }
            },
            required: ["testArg"]
        },
        annotations: {
            readOnly: true
        }
    } as Tool,

    MOCK_RESOURCE: {
        uri: "file:///test.txt",
        name: "test.txt",
        description: "A test file",
        mimeType: "text/plain"
    } as Resource,

    MOCK_PROMPT: {
        name: "mock_prompt",
        description: "A mock prompt for testing",
        arguments: [
            { name: "arg1", description: "First arg", required: true }
        ]
    } as Prompt,

    MOCK_CONTENT: {
        type: "text",
        text: "Hello world"
    } as ContentBlock,
};
