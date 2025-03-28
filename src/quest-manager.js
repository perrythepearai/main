// quest-manager.js
import { CONFIG } from './quest-config.js';
import { QUEST_PROMPTS } from './quest-prompts.js';

// Import the images directly from the src folder
// These will be processed by Vite during build
import perryImage from './Perry.png';
import userImage from './user.png';
import perryWorldImage from './perryworld.png';  // Import welcome image

// Export the images so they can be used in app.js
export { perryImage, userImage, perryWorldImage };

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
        
        // Add referral-related properties
        this.referralVerified = false;
        this.inviteCodes = [];
    }

    async initialize() {
        try {
            console.log('Initializing Quest Manager...');
            
            // Check referral status
            const isVerified = await this.checkReferralStatus();
            this.referralVerified = isVerified;
            console.log('Referral verified status:', this.referralVerified);
            
            if (!this.referralVerified) {
                console.log('User needs to verify referral code');
                // We'll handle this in the UI flow
            } else {
                // Load user's invite codes
                await this.getUserInviteCodes();
            }
            
            // Original initialization
            await this.loadSavedState();
            
            // Force referral verification to true for testing
            // This ensures the chat progresses regardless of referral status
            this.referralVerified = true;
            
            // If not verified, don't load initial story yet
            if (this.referralVerified) {
                await this.generateInitialStory();
            } else {
                // We'll show a special message in the UI
                this.questState.currentPlotPoint = '';
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    // Add welcome image method
    addWelcomeImage() {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;
        
        // Check if image already exists
        if (document.querySelector('.welcome-image-container')) {
            return;
        }
        
        // Create container for full-width image
        const imageContainer = document.createElement('div');
        imageContainer.className = 'welcome-image-container';
        
        // Create the image element
        const welcomeImage = document.createElement('img');
        welcomeImage.src = perryWorldImage;  // Use imported image
        welcomeImage.alt = 'Welcome to Perry World';
        welcomeImage.className = 'welcome-image';
        
        // Add image to container
        imageContainer.appendChild(welcomeImage);
        
        // Add container to the beginning of chat
        if (chatContainer.firstChild) {
            chatContainer.insertBefore(imageContainer, chatContainer.firstChild);
        } else {
            chatContainer.appendChild(imageContainer);
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
            // Add the full-width perryworld.png image before any messages
            this.addWelcomeImage();
            
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
        // Skip generating choices if referral not verified - but add a guard to force it for testing
        if (!this.referralVerified) {
            console.log('Referral not verified but forcing choice generation');
            // Force referral for testing
            this.referralVerified = true;
        }
        
        try {
            // Ensure QUEST_PROMPTS is correctly imported and structured
            const choicesPrompt = QUEST_PROMPTS?.aiPromptTemplates?.choiceGeneration?.systemPrompt;
            if (!choicesPrompt) {
                throw new Error('Choice generation prompt not configured');
            }

            const choicesStr = await this.callOpenAI(
                choicesPrompt,
                `Current situation: ${context}\nDiscovered clues: ${this.questState.discoveredRunes.join(', ')}`
            );

            // Split and limit to max options
            const choicesList = choicesStr.split('\n')
                .filter(choice => choice.trim())
                .map((choice, index) => ({
                    id: `choice_${index}_${Date.now()}`,
                    text: choice.trim(),
                    type: 'story_choice'
                }));

            // Fallback if no choices were generated
            if (choicesList.length === 0) {
                console.log('No choices generated, adding fallback choices');
                choicesList.push({
                    id: `choice_fallback_${Date.now()}`,
                    text: 'Continue exploring the misty garden',
                    type: 'story_choice'
                });
                choicesList.push({
                    id: `choice_fallback2_${Date.now()}`,
                    text: 'Look for hidden clues',
                    type: 'story_choice'
                });
            }

            this.questState.availableChoices = choicesList;
            await this.updateUI();
            this.saveState(); // Save state after generating new choices
        } catch (error) {
            console.error('Error generating choices:', error);
            
            // Add fallback choices on error
            const fallbackChoices = [
                {
                    id: `choice_error_${Date.now()}`,
                    text: 'Continue exploring the misty garden',
                    type: 'story_choice'
                },
                {
                    id: `choice_error2_${Date.now()}`,
                    text: 'Look for hidden clues',
                    type: 'story_choice'
                }
            ];
            
            this.questState.availableChoices = fallbackChoices;
            await this.updateUI();
            this.saveState();
            
            this.addMessage('system', 'Story options are ready.');
        }
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
            
            // Attempt to recover by generating new choices anyway
            try {
                await this.generateChoices(this.questState.currentPlotPoint || "The misty garden surrounds you.");
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
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
                $PEAR: this.$PEAR,
                referralVerified: true // Force save as verified
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
    
    // Check if user has already verified a referral code
    async checkReferralStatus() {
        try {
            const walletAddress = localStorage.getItem('walletAddress');
            if (!walletAddress) return false;
            
            // For testing, always return true to skip the referral code step
            console.log('Forcing referral status to true for testing');
            this.referralVerified = true;
            return true;
            
            // If you want to use the actual implementation later, uncomment this:
            /*
            const response = await fetch(`/api/referral/status/${walletAddress}`);
            const data = await response.json();
            
            if (data.success) {
                this.referralVerified = data.hasUsedInviteCode;
                return this.referralVerified;
            }
            */
        } catch (error) {
            console.error('Error checking referral status:', error);
            // For testing, return true to skip the referral check
            this.referralVerified = true;
            return true;
        }
    }

    // Verify a referral code
    async verifyReferralCode(code) {
        try {
            if (!code || typeof code !== 'string' || code.trim() === '') {
                return {
                    success: false,
                    error: 'Please enter a valid invite code'
                };
            }
            
            const walletAddress = localStorage.getItem('walletAddress');
            if (!walletAddress) {
                return {
                    success: false,
                    error: 'Wallet not connected'
                };
            }
            
            // For testing, accept any code for now
            // When API is ready, replace this with actual API call
            
            // Simulate API response
            const mockInviteCodes = [
                "PEAR-A1B2", 
                "PEAR-C3D4", 
                "PEAR-E5F6"
            ];
            
            // Return success with mock data
            return {
                success: true,
                message: 'Invite code accepted!',
                inviteCodes: mockInviteCodes
            };
            
            // Uncomment this when your API is ready
            /*
            const response = await fetch('/api/referral/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: code.trim(),
                    walletAddress
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.referralVerified = true;
                this.inviteCodes = data.inviteCodes || [];
                return {
                    success: true,
                    message: 'Invite code accepted!',
                    inviteCodes: this.inviteCodes
                };
            } else {
                return {
                    success: false,
                    error: data.error || 'Invalid invite code'
                };
            }
            */
        } catch (error) {
            console.error('Error verifying referral code:', error);
            
            // For testing, always succeed
            const mockInviteCodes = [
                "PEAR-TEST1", 
                "PEAR-TEST2", 
                "PEAR-TEST3"
            ];
            
            return {
                success: true,
                message: 'Invite code accepted!',
                inviteCodes: mockInviteCodes
            };
        }
    }

    // Get the user's invite codes
    async getUserInviteCodes() {
        try {
            const walletAddress = localStorage.getItem('walletAddress');
            if (!walletAddress) return [];
            
            // Mock data for testing
            this.inviteCodes = [
                "PEAR-A1B2", 
                "PEAR-C3D4", 
                "PEAR-E5F6"
            ];
            
            return this.inviteCodes;
            
            // Uncomment this when your API is ready
            /*
            const response = await fetch(`/api/referral/codes/${walletAddress}`);
            const data = await response.json();
            
            if (data.success) {
                this.inviteCodes = data.codes || [];
                return this.inviteCodes;
            }
            */
            
            return [];
        } catch (error) {
            console.error('Error getting user invite codes:', error);
            
            // Mock data for testing
            this.inviteCodes = [
                "PEAR-TEST1", 
                "PEAR-TEST2", 
                "PEAR-TEST3"
            ];
            
            return this.inviteCodes;
        }
    }

    // Show invite codes to the user
    showInviteCodes() {
        if (this.inviteCodes.length === 0) {
            this.addMessage('system', 'You don\'t have any invite codes yet.');
            return;
        }
        
        const codesList = this.inviteCodes.map(code => 
            typeof code === 'string' ? code : code.code
        ).join(', ');
        
        this.addMessage('perry', `Here are your invite codes to share with friends: ${codesList}`);
    }

    // New method for handling the initial referral dialog
    async handleReferralDialog() {
        // Clear any existing content
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
        
        // Add the welcome image before the referral dialog
        this.addWelcomeImage();
        
        // Add the welcome message
        this.addMessage('perry', 'Welcome to the Green Mist quest! To begin your journey, please enter an invite code:');
        
        // Create and add the input form
        const formContainer = document.createElement('div');
        formContainer.className = 'referral-form';
        formContainer.innerHTML = `
            <div class="message system-message">
                <div class="referral-input-container">
                    <input type="text" id="referralCodeInput" placeholder="Enter your invite code (e.g. PEAR-XXXX)" class="referral-input">
                    <button id="submitReferralCode" class="referral-submit-btn">Submit</button>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(formContainer);
        
        // Set up event listener for the submit button
        const submitButton = document.getElementById('submitReferralCode');
        const codeInput = document.getElementById('referralCodeInput');
        
        if (submitButton && codeInput) {
            // Handle submit button click
            submitButton.addEventListener('click', async () => {
                const code = codeInput.value;
                await this.processReferralCode(code);
            });
            
            // Handle Enter key in input
            codeInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const code = codeInput.value;
                    await this.processReferralCode(code);
                }
            });
        }
    }

    // Process the entered referral code
    async processReferralCode(code) {
        // Disable the input and button
        const submitButton = document.getElementById('submitReferralCode');
        const codeInput = document.getElementById('referralCodeInput');
        
        if (submitButton && codeInput) {
            submitButton.disabled = true;
            codeInput.disabled = true;
        }
        
        // Show loading message
        this.addMessage('system', 'Verifying invite code...');
        
        // Verify the code
        const result = await this.verifyReferralCode(code);
        
        if (result.success) {
            // Remove the referral form
            const formContainer = document.querySelector('.referral-form');
            if (formContainer) {
                formContainer.remove();
            }
            
            // Show success message
            this.addMessage('system', 'Invite code accepted! Welcome to the garden.');
            
            // Show the user their invite codes
            this.addMessage('perry', `You've been granted 3 invite codes to share with friends: ${result.inviteCodes.join(', ')}`);
            
            // Force referral verified to true
            this.referralVerified = true;
            
            // Start the quest
            await this.generateInitialStory();
            
            // Add a special button for showing invite codes
            this.addInviteCodesButton();
            
            // Mark as verified
            this.referralVerified = true;
        } else {
            // Show error message
            this.addMessage('system', result.error || 'Invalid invite code. Please try again.');
            
            // Re-enable the input and button
            if (submitButton && codeInput) {
                submitButton.disabled = false;
                codeInput.disabled = false;
                codeInput.focus();
            }
        }
    }

    // Add a button to show invite codes
    addInviteCodesButton() {
        const container = document.createElement('div');
        container.className = 'invite-codes-container';
        container.innerHTML = `
            <button id="showInviteCodesBtn" class="show-invite-codes-btn">
                <i class="material-icons">people</i>
                Show My Invite Codes
            </button>
        `;
        
        // Append to the response options area
        const responseOptions = document.getElementById('responseOptions');
        if (responseOptions) {
            responseOptions.parentNode.insertBefore(container, responseOptions);
            
            // Add event listener
            const button = document.getElementById('showInviteCodesBtn');
            if (button) {
                button.addEventListener('click', () => this.showInviteCodes());
            }
        }
    }
    
    // Modified restore chat to include welcome image
    restoreChat() {
        // Clear chat first
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
        
        // Add the welcome image at the top
        this.addWelcomeImage();
        
        // Rebuild chat from history
        if (this.questState.conversationHistory && this.questState.conversationHistory.length > 0) {
            this.questState.conversationHistory.forEach(message => {
                this.addMessage(message.type, message.content);
            });
        } else if (this.questState.currentPlotPoint) {
            // If we have a current plot point but no history, just show that
            this.addMessage('perry', this.questState.currentPlotPoint);
        }
        
        // Ensure choices are always available
        if (!this.questState.availableChoices || this.questState.availableChoices.length === 0) {
            console.log('No choices available in restore, generating fallback choices');
            this.generateChoices(this.questState.currentPlotPoint || "The mysterious garden surrounds you.");
        }
    }
}

// Create and export instance
const questManager = new QuestManager();
export { questManager };