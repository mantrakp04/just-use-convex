import { createTool, createToolkit } from "@voltagent/core";
import { z } from "zod";

// Schema for ask_user tool parameters
const askUserParameters = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().describe("Unique identifier for this question"),
        question: z.string().describe("The question text. Clear and specific."),
        header: z
          .string()
          .max(16)
          .optional()
          .describe("Short label shown as chip/tag (e.g., 'Auth', 'Framework')"),
        options: z
          .array(
            z.object({
              id: z.string().describe("Unique option identifier"),
              label: z.string().describe("Display text (1-5 words)"),
              description: z
                .string()
                .optional()
                .describe("Explanation of what this option means"),
            })
          )
          .min(2)
          .max(5)
          .describe("Available choices. 'Other' is always added automatically."),
        multiSelect: z
          .boolean()
          .optional()
          .default(false)
          .describe("Allow multiple selections for this question"),
        required: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether this question must be answered"),
      })
    )
    .min(1)
    .max(4)
    .describe("Questions to ask the user (1-4)"),
  context: z
    .string()
    .optional()
    .describe("Shared context shown above all questions"),
});

// Type for the tool input
export type AskUserInput = z.infer<typeof askUserParameters>;

// Type for a single question
export type AskUserQuestion = AskUserInput["questions"][number];

// Type for a single option
export type AskUserOption = AskUserQuestion["options"][number];

// Type for the user's answer to a single question
export type AskUserAnswer = {
  selectedIds: string[];
  customText?: string;
};

// Type for the complete response
export type AskUserResult = {
  answers: Record<string, AskUserAnswer>;
  timestamp: number;
};

// Helper to parse the approval reason as AskUserResult
export function parseAskUserResult(reason: string | undefined): AskUserResult | null {
  if (!reason) return null;
  try {
    // Try to parse as JSON (our structured response)
    if (reason.startsWith("{")) {
      return JSON.parse(reason) as AskUserResult;
    }
  } catch {
    // Not valid JSON, return null
  }
  return null;
}

const askUserTool = createTool({
  name: "ask_user",
  description: `Ask the user one or more questions to gather information, clarify requirements, or get decisions.

Use this tool when you need to:
- Clarify ambiguous instructions or requirements
- Get user preferences or choices between options
- Confirm important decisions before proceeding
- Gather additional context that isn't clear from the conversation

Guidelines:
- Keep questions clear and concise
- Provide 2-5 meaningful options per question
- Include helpful descriptions for non-obvious options
- Use multiSelect when choices aren't mutually exclusive
- Group related questions in a single call (max 4)
- Users can always type a custom response via "Other"

The tool will pause and wait for user input. The user's response will be returned
in the approval result with their selected options and any custom text.`,
  parameters: askUserParameters,
  execute: async (args) => {
    const input = args as AskUserInput;
    // Return the questions - the approval flow handles getting user responses
    // The user's answers come back via the approval reason field as JSON
    return {
      questions: input.questions,
      context: input.context,
    };
  },
});

// Always require approval - this is how we get user input
Object.defineProperty(askUserTool, "needsApproval", {
  value: () => true,
  writable: true,
  configurable: true,
});

const ASK_USER_INSTRUCTIONS = `You have access to the ask_user tool for gathering information from the user.

## When to Use ask_user

Use this tool when you need:
- Clarification on ambiguous requirements
- User preferences between valid options
- Confirmation before significant actions
- Additional context not provided in the conversation

## Best Practices

1. **Be specific**: Ask clear, focused questions
2. **Provide context**: Help users understand why you're asking
3. **Offer good options**: Include the most likely/useful choices
4. **Use descriptions**: Explain non-obvious options
5. **Batch related questions**: Group up to 4 related questions in one call
6. **Respect answers**: Use the information provided, don't re-ask

## Example

\`\`\`json
{
  "context": "Setting up the authentication system",
  "questions": [
    {
      "id": "auth_method",
      "header": "Auth",
      "question": "Which authentication method should we use?",
      "options": [
        { "id": "jwt", "label": "JWT tokens", "description": "Stateless, good for APIs" },
        { "id": "session", "label": "Sessions", "description": "Server-side, traditional web apps" }
      ]
    }
  ]
}
\`\`\`
`;

export function createAskUserToolkit() {
  return createToolkit({
    name: "ask_user",
    description: "Tools for gathering information and preferences from the user",
    instructions: ASK_USER_INSTRUCTIONS,
    tools: [askUserTool],
  });
}

export { askUserTool };
