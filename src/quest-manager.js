// quest-manager.js
import { CONFIG } from './quest-config.js';
import { QUEST_PROMPTS } from './quest-prompts.js';

// Import the images directly from the src folder
// These will be processed by Vite during build
import perryImage from './Perry.png';
import userImage from './user.png';

class QuestManager {
    constructor() {
        this.currentEpisode = 1;
        this.currentPuzzle = null;
        this.state = 'main';
        this.hintsUsed = 0;
        this.$PEAR = CONFIG.GAME.INITIAL_SPEAR;
        this.aiCache = new Map();
        this.isInitialized = false;
        this.questState = {
            discoveredRunes: [],
            solvedPuzzles: [],
            unlockedAreas: ['Garden Entrance'],
            currentPlotPoint: '',
            availableChoices: [],
            conversationHistory: []
        };
    }

    async initialize() {
        try {
            console.log('Initializing Quest Manager...');
            await this.loadSavedState();
            await this.generateInitialStory();
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    async generateInitialStory() {
        // Only generate if we don't have a current plot point
        if (this.questState.currentPlotPoint) {
            console.log('Using existing plot point, skipping initial story generation');
            return this.questState.currentPlotPoint;
        }
        
        this.addLoadingMessage();
        try {
            const story = await this.callOpenAI(
                QUEST_PROMPTS.aiPromptTemplates.storyGeneration.systemPrompt,
                "Begin the story in an engaging way that sets up the mystery of the Green Mist and L3MON."
            );
            
            this.questState.currentPlotPoint = story;
            this.questState.conversationHistory.push({
                type: 'perry',
                content: story
            });
            
            await this.generateChoices(story);
            this.addMessage('perry', story);
            return story;
        } finally {
            this.removeLoadingMessage();
        }
    }

    async loadSavedState() {
        try {
            const walletAddress = localStorage.getItem('walletAddress');
            if (!walletAddress) return;
            
            // Get state with wallet address as key
            const stateKey = `questState_${walletAddress.toLowerCase()}`;
            const savedState = localStorage.getItem(stateKey);
            
            if (savedState) {
                const state = JSON.parse(savedState);
                Object.assign(this.questState, state);
                this.$PEAR = state.$PEAR || this.$PEAR;
                console.log('Loaded saved state successfully for wallet:', walletAddress);
            }
        } catch (e) {
            console.warn('Failed to load saved state:', e);
        }
    }
    
    async callOpenAI(systemPrompt, userPrompt) {
        const cacheKey = `${systemPrompt}:${userPrompt}`;
        if (this.aiCache.has(cacheKey)) {
            return this.aiCache.get(cacheKey);
        }

        // Check if we have a valid API key
        const hasValidApiKey = CONFIG.OPENAI.API_KEY && 
                              CONFIG.OPENAI.API_KEY.startsWith('sk-') && 
                              CONFIG.OPENAI.API_KEY.length > 10;

        try {
            // For development without API key, use mocked responses
            if (!hasValidApiKey) {
                console.warn('Using mock AI responses due to missing/invalid API key');
                
                // Determine what kind of response to generate based on the prompt
                let mockResponse = '';
                
                if (userPrompt.includes('Begin the story')) {
                    mockResponse = 'The Green Mist swirls through the digital garden, obscuring pathways and hiding secrets. Welcome to the mysterious realm of L3M0N, where blockchain and nature intertwine. What path will you choose, explorer?';
                } 
                else if (systemPrompt.includes('choiceGeneration')) {
                    mockResponse = 'Investigate the strange glowing rune near the fountain.\nFollow the trail of corrupted data nodes deeper into the mist.\nSeek out the keeper of digital seeds who might have answers.\nAnalyze the pattern of the mist\'s movement for clues.';
                }
                else {
                    mockResponse = 'As you venture deeper, the Green Mist parts momentarily, revealing fractured code patterns in the air. Could this be connected to the L3M0N protocol? The garden seems to respond to your blockchain signature, opening new pathways forward.';
                }
                
                this.aiCache.set(cacheKey, mockResponse);
                return mockResponse;
            }

            // If we have a valid API key, make the real API call
            const response = await fetch(CONFIG.OPENAI.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.OPENAI.API_KEY}`
                },
                body: JSON.stringify({
                    model: CONFIG.OPENAI.MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: CONFIG.OPENAI.TEMPERATURE,
                    max_tokens: 2048
                })
            });

            if (!response.ok) throw new Error('OpenAI API call failed');
            
            const data = await response.json();
            const generatedContent = data.choices[0].message.content;
            
            this.aiCache.set(cacheKey, generatedContent);
            return generatedContent;
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            
            // Fallback to cached content or mock response
            if (this.aiCache.has('fallback:' + systemPrompt)) {
                return this.aiCache.get('fallback:' + systemPrompt);
            }
            
            // Generate a simple fallback response
            const fallback = 'The path ahead is shrouded in mist. What would you like to do next?';
            this.aiCache.set('fallback:' + systemPrompt, fallback);
            return fallback;
        }
    }

    async generateChoices(context) {
        const choices = await this.callOpenAI(
            QUEST_PROMPTS.aiPromptTemplates.choiceGeneration.systemPrompt,
            `Current situation: ${context}\nDiscovered clues: ${this.questState.discoveredRunes.join(', ')}`
        );

        this.questState.availableChoices = choices.split('\n')
            .filter(choice => choice.trim())
            .map((choice, index) => ({
                id: `choice_${index}_${Date.now()}`,
                text: choice.trim(),
                type: 'story_choice'
            }));

        await this.updateUI();
        this.saveState();
    }

    async handleOptionSelect(optionId) {
        try {
            const selectedChoice = this.questState.availableChoices.find(c => c.id === optionId);
            if (!selectedChoice) return;

            // Add user's choice to chat and history
            this.addMessage('user', selectedChoice.text);
            this.questState.conversationHistory.push({
                type: 'user',
                content: selectedChoice.text
            });

            this.addLoadingMessage();

            // Get Perry's response
            const response = await this.callOpenAI(
                QUEST_PROMPTS.aiPromptTemplates.storyGeneration.systemPrompt,
                `Previous context: ${this.questState.currentPlotPoint}\nUser chose: ${selectedChoice.text}\nConversation history: ${JSON.stringify(this.questState.conversationHistory.slice(-5))}`
            );

            // Update state and display Perry's response
            this.questState.currentPlotPoint = response;
            this.addMessage('perry', response);
            this.questState.conversationHistory.push({
                type: 'perry',
                content: response
            });

            // Generate new choices and check for puzzle triggers
            await this.generateChoices(response);
            await this.checkForPuzzleTrigger(response);
            
            // Save state after interaction
            this.saveState();

        } catch (error) {
            console.error('Error handling option:', error);
            this.addMessage('system', 'An error occurred. Please try again.');
        } finally {
            this.removeLoadingMessage();
        }
    }
    
    // Save state
    saveState() {
        try {
            const walletAddress = localStorage.getItem('walletAddress');
            if (!walletAddress) return;
            
            // Store state with wallet address as key
            const stateKey = `questState_${walletAddress.toLowerCase()}`;
            const state = {
                ...this.questState,
                $PEAR: this.$PEAR
            };
            
            localStorage.setItem(stateKey, JSON.stringify(state));
            console.log('State saved successfully for wallet:', walletAddress);
        } catch (e) {
            console.error('Failed to save state:', e);
        }
    }
    
    // quest-manager.js - Part 3: UI and Messages
    addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingMessage';
        loadingDiv.className = 'loading-message';
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <div>Perry is thinking...</div>
        `;
        document.body.appendChild(loadingDiv);
    }

    removeLoadingMessage() {
        const loadingDiv = document.getElementById('loadingMessage');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    addMessage(type, content) {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        if (type !== 'system') {
            // Use the createMessageWithAvatar method to generate the message content
            messageDiv.innerHTML = this.createMessageWithAvatar(type, content);
        } else {
            // For system messages, no avatar needed
            messageDiv.innerHTML = `
                <div class="${type}-message-content">
                    <span class="message-text">${content}</span>
                </div>
            `;
        }

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // Message content with the imported image paths
    createMessageWithAvatar(type, content) {
        try {
            // Use the imported image paths
            const imgSrc = type === 'perry' ? perryImage : userImage;
            
            return `
                <div class="${type}-message-content">
                    <img src="${imgSrc}" class="message-avatar" alt="${type}">
                    <span class="message-text">${content}</span>
                </div>
            `;
        } catch (e) {
            console.error('Error creating avatar:', e);
            
            // Fallback to CSS avatar if there's any issue
            return `
                <div class="${type}-message-content">
                    <div class="avatar-circle ${type}-avatar">${type === 'perry' ? 'P' : 'U'}</div>
                    <span class="message-text">${content}</span>
                </div>
            `;
        }
    }

    async updateUI() {
        const optionsContainer = document.getElementById('responseOptions');
        if (!optionsContainer) return;

        optionsContainer.innerHTML = '';
        this.questState.availableChoices.forEach(option => {
            const button = document.createElement('button');
            button.className = `response-option-btn ${option.type}-action`;
            button.textContent = option.text;
            button.setAttribute('data-option-id', option.id);
            button.onclick = () => this.handleOptionSelect(option.id);
            optionsContainer.appendChild(button);
        });
    }

    // quest-manager.js - Part 4: Puzzles and Progress
    async checkForPuzzleTrigger(response) {
        if (!this.questState.solvedPuzzles.includes('mist_pattern') &&
            (response.toLowerCase().includes('grid') || 
             response.toLowerCase().includes('pattern') ||
             response.toLowerCase().includes('coordinate'))) {
            
            this.currentPuzzle = 'mist_pattern';
            this.addMessage('system', 'A pattern emerges in the mist... Can you decode it?');
            this.saveState();
        }
    }

    async submitSolution() {
        const input = document.getElementById('puzzleSolution');
        if (!input) return;

        const solution = input.value.trim().toUpperCase();
        if (solution === 'GRID4C2E') {
            this.$PEAR += CONFIG.GAME.PUZZLE_COMPLETION_BONUS;
            this.questState.solvedPuzzles.push('mist_pattern');
            this.addMessage('system', `Correct! You've earned ${CONFIG.GAME.PUZZLE_COMPLETION_BONUS} $PEAR!`);
            document.querySelector('.modal')?.remove();
            this.saveState();
        } else {
            this.addMessage('system', 'That\'s not quite right. Try again.');
        }
    }

    async requestHint() {
        if (this.$PEAR < CONFIG.GAME.HINT_COST) {
            this.addMessage('system', 'Not enough $PEAR for a hint.');
            return;
        }

        this.$PEAR -= CONFIG.GAME.HINT_COST;
        this.hintsUsed++;

        const hint = await this.callOpenAI(
            QUEST_PROMPTS.aiPromptTemplates.hintGeneration.systemPrompt,
            `Puzzle type: grid pattern\nHints used: ${this.hintsUsed}\nSolution related to: coordinates and numbers`
        );

        this.addMessage('system', hint);
        this.saveState();
    }
}

// Create and export instance
const questManager = new QuestManager();
export { questManager };