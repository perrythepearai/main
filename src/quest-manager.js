// quest-manager.js
import { CONFIG } from './quest-config.js';
import { QUEST_PROMPTS } from './quest-prompts.js';

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
            this.setupProgressTracking();
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    async generateInitialStory() {
        this.addLoadingMessage();
        try {
            const story = await this.callOpenAI(
                QUEST_PROMPTS.aiPromptTemplates.storyGeneration.systemPrompt,
                "Begin the story in an engaging way that sets up the mystery of the Green Mist and L3MON."
            );
            
            this.questState.currentPlotPoint = story;
            await this.generateChoices(story);
            this.addMessage('perry', story);
            return story;
        } finally {
            this.removeLoadingMessage();
        }
    }

    async loadSavedState() {
        try {
            const savedState = localStorage.getItem('questState');
            if (savedState) {
                const state = JSON.parse(savedState);
                Object.assign(this.questState, state);
                this.$PEAR = state.$PEAR || this.$PEAR;
            }
        } catch (e) {
            console.warn('Failed to load saved state:', e);
        }
    }

    setupProgressTracking() {
        const progressBtn = document.getElementById('progressButton');
        const puzzlesBtn = document.getElementById('puzzlesButton');

        if (progressBtn) {
            progressBtn.onclick = () => this.showProgress();
        }
        if (puzzlesBtn) {
            puzzlesBtn.onclick = () => this.showAvailablePuzzles();
        }
    }
    
    
    // quest-manager.js - Part 2: AI Integration
    async callOpenAI(systemPrompt, userPrompt) {
        const cacheKey = `${systemPrompt}:${userPrompt}`;
        if (this.aiCache.has(cacheKey)) {
            return this.aiCache.get(cacheKey);
        }

        try {
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
            throw error;
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

        } catch (error) {
            console.error('Error handling option:', error);
            this.addMessage('system', 'An error occurred. Please try again.');
        } finally {
            this.removeLoadingMessage();
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
        
        let icon = '';
        switch(type) {
            case 'user':
                icon = '👤';
                break;
            case 'perry':
                icon = '🤖';
                break;
            case 'system':
                icon = 'ℹ️';
                break;
        }

        messageDiv.innerHTML = `
            <div class="${type}-message-content">
                <span class="message-icon">${icon}</span>
                <span class="message-text">${content}</span>
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async updateUI() {
        const optionsContainer = document.getElementById('responseOptions');
        if (!optionsContainer) return;

        optionsContainer.innerHTML = '';
        this.questState.availableChoices.forEach(option => {
            const button = document.createElement('button');
            button.className = `response-option-btn ${option.type}-action`;
            button.textContent = option.text;
            button.onclick = () => this.handleOptionSelect(option.id);
            optionsContainer.appendChild(button);
        });
    }

    showModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>${title}</h2>
                ${content}
                <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // quest-manager.js - Part 4: Puzzles and Progress
    async checkForPuzzleTrigger(response) {
        if (!this.questState.solvedPuzzles.includes('mist_pattern') &&
            (response.toLowerCase().includes('grid') || 
             response.toLowerCase().includes('pattern') ||
             response.toLowerCase().includes('coordinate'))) {
            
            this.currentPuzzle = 'mist_pattern';
            this.addMessage('system', 'A pattern emerges in the mist... Can you decode it?');
        }
    }

    showProgress() {
        const content = `
            <div class="progress-container">
                <p>$PEAR Balance: ${this.$PEAR}</p>
                <p>Puzzles Solved: ${this.questState.solvedPuzzles.length}</p>
                <p>Runes Discovered: ${this.questState.discoveredRunes.join(', ') || 'None'}</p>
                <p>Areas Unlocked: ${this.questState.unlockedAreas.join(', ')}</p>
            </div>
        `;
        this.showModal('Quest Progress', content);
    }

    showAvailablePuzzles() {
        let content = '<div class="puzzles-container">';
        
        if (this.currentPuzzle === 'mist_pattern' && 
            !this.questState.solvedPuzzles.includes('mist_pattern')) {
            content += `
                <div class="puzzle-item">
                    <h3>The Mist Pattern</h3>
                    <p>A mysterious grid pattern appears in the mist...</p>
                    <div class="puzzle-input">
                        <input type="text" id="puzzleSolution" placeholder="Enter solution">
                        <button onclick="window.questManager.submitSolution()">Submit</button>
                        <button onclick="window.questManager.requestHint()">Get Hint (25 $PEAR)</button>
                    </div>
                </div>
            `;
        } else {
            content += '<p>No puzzles currently available...</p>';
        }
        
        content += '</div>';
        this.showModal('Available Puzzles', content);
    }

    async submitSolution() {
        const input = document.getElementById('puzzleSolution');
        if (!input) return;

        const solution = input.value.trim().toUpperCase();
        if (solution === 'GRID4C2E') {
            this.$PEAR += CONFIG.GAME.PUZZLE_COMPLETION_BONUS;
            this.questState.solvedPuzzles.push('mist_pattern');
            this.addMessage('system', `Correct! You've earned ${CONFIG.GAME.PUZZLE_COMPLETION_BONUS} $PEAR!`);
            document.querySelector('.modal').remove();
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
    }
}

// Create and export instance
export const questManager = new QuestManager();