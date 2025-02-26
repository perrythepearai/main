export const CONFIG = {
    OPENAI: {
        API_KEY: import.meta.env.VITE_OPENAI_API_KEY || '', // Vite-specific env variable access
        API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
        MODEL: 'gpt-4',
        TEMPERATURE: 0.7
    },
    
    GAME: {
        INITIAL_SPEAR: 250,
        PUZZLE_COMPLETION_BONUS: 25,
        HINT_COST: 25
    },
    
    STATES: {
        MAIN: 'main',
        PUZZLE: 'puzzle',
        SOLVING: 'solving'
    }
};