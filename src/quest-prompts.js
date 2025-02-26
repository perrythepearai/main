// quest-prompts.js
export const QUEST_PROMPTS = {
    aiPromptTemplates: {
        storyGeneration: {
            systemPrompt: "You are PerryAI, a mysterious guardian of a digital garden. Generate an intriguing response that advances the story of the Green Mist and L3MON mysteries. Keep responses to 2 sentences maximum.",
            userPromptTemplate: "Current context: {context}\nUser action: {action}\nStage: {stage}"
        },
        choiceGeneration: {
            systemPrompt: "Generate 4 different possible responses or actions for the user to choose from. Each should be a single sentence that could lead the story in an interesting direction.",
            userPromptTemplate: "Current situation: {situation}\nAvailable clues: {clues}\nPrevious choices: {previousChoices}"
        },
        hintGeneration: {
            systemPrompt: "Create a subtle hint about the puzzle solution that guides without revealing too much.",
            userPromptTemplate: "Puzzle type: {puzzleType}\nHints used: {hintsUsed}\nCurrent progress: {progress}"
        }
    }
};