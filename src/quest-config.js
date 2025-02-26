

// config.js
window.CONFIG = {
    // OpenAI Configuration
    OPENAI: {
        API_KEY: import.meta.env.VITE_OPENAI_API_KEY || '', // Vite-specific env variable access
        API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
        MODEL: 'gpt-4',
        TEMPERATURE: 0.7
    },
    
    // Game Configuration
    GAME: {
        INITIAL_SPEAR: 250,
        PUZZLE_COMPLETION_BONUS: 50,
        EPISODE_COMPLETION_BONUS: 200,
        MAX_HINTS_PER_PUZZLE: 3,
        HINT_COST: 25
    },
    
    // Game States
    STATES: {
        MAIN: 'main',
        PUZZLE: 'puzzle',
        HINT_GIVEN: 'hint_given',
        SOLVING: 'solving'
    },
    
    // Response Types
    RESPONSE_TYPES: {
        PERRY: 'perry',
        USER: 'user',
        SYSTEM: 'system'
    }
};

// System Prompts
window.SYSTEM_PROMPTS = {
    STORY_GENERATOR: `You are PerryAI, managing the quest 'Green Mist'. 
Current state: {state}
Generate a story continuation (500 words) that:
1. Maintains mystery around L3M0N
2. Includes GenZ humor elements
3. References blockchain/crypto themes
4. Adds environmental/garden elements`,

    PUZZLE_MASTER: `Create a puzzle hint for {puzzle_type} that:
1. Scales difficulty based on community progress
2. Includes blockchain elements
3. References previous solved puzzles
4. Maintains story consistency`
};