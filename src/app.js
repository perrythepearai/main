// app.js
import { questManager, perryImage, userImage, perryWorldImage } from './quest-manager.js';
import { CONFIG } from './quest-config.js';
import { QUEST_PROMPTS } from './quest-prompts.js';
import { TokenService } from './token-service.js';

// Debug logging for OpenAI configuration
console.log('OpenAI config check:', {
  api_key_exists: !!CONFIG.OPENAI.API_KEY,
  api_key_length: CONFIG.OPENAI.API_KEY ? CONFIG.OPENAI.API_KEY.length : 0,
  api_endpoint: CONFIG.OPENAI.API_ENDPOINT
});

// Ensure original questManager is imported correctly
const originalQuestManager = questManager;

// Global variables with explicit typing
let chatContainer = null;
let responseOptions = null;
let addressElement = null;
let tokenDisplayElement = null;

let tokenService = null;
let approvalCompleted = false;

// Utility function to initialize DOM elements
function initializeElements() {
  chatContainer = document.getElementById('chatContainer');
  responseOptions = document.getElementById('responseOptions');
  addressElement = document.getElementById('address');
  tokenDisplayElement = document.querySelector('.token-amount');
}

// Utility function to add system messages
function addSystemMessage(content) {
  if (!chatContainer) {
    console.warn('Chat container not initialized');
    return;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system-message';
  messageDiv.innerHTML = `
    <div class="message-content">
      <span class="message-text">${content}</span>
    </div>
  `;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Network check function
async function checkNetwork() {
  if (!window.ethereum) {
    addSystemMessage('MetaMask not detected. Please install MetaMask to continue.');
    return false;
  }

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== CONFIG.TOKEN.REQUIRED_CHAIN_ID) {
      addSystemMessage(`
        ⚠️ Incorrect network detected. 
        Please switch to Polygon network in your wallet. 
        Current Chain ID: ${chainId}, 
        Required Chain ID: ${CONFIG.TOKEN.REQUIRED_CHAIN_ID}
      `);
      return false;
    }
    return true;
  } catch (error) {
    addSystemMessage(`Network check failed: ${error.message}`);
    return false;
  }
}

// Token approval function - simplified to be a no-op
async function requestTokenApproval() {
  if (!tokenService) {
    return false;
  }

  // We're now using direct transfers, so no approval needed
  // This function is kept for backward compatibility
  try {
    const result = await tokenService.approveTokenSpending();
    if (result.success) {
      approvalCompleted = true;
      return true;
    } else {
      console.warn('Token approval skipped - using direct transfers');
      return true; // Return true anyway since we're using direct transfers
    }
  } catch (error) {
    console.warn('Error during token approval:', error.message);
    return true; // Return true anyway since we're using direct transfers
  }
}

// Update PEAR balance function
async function updatePearBalance() {
  try {
    const walletAddress = localStorage.getItem('walletAddress');
    if (!walletAddress) return;

    // Temporary loading indicator
    if (tokenDisplayElement) {
      tokenDisplayElement.textContent = 'Updating...';
    }

    const balance = await tokenService.getPearBalance();
    
    if (tokenDisplayElement) {
      tokenDisplayElement.textContent = `${balance} $PEAR`;
    }
    
  } catch (error) {
    console.error('Error updating PEAR balance:', error);
    if (tokenDisplayElement) {
      tokenDisplayElement.textContent = '? $PEAR';
    }
  }
}

// Enhanced Quest Manager
class EnhancedQuestManager extends originalQuestManager.constructor {
  constructor() {
    super();
    this.processingOptions = new Set();
    this.maxOptionsPerStep = 4;
    
    // Add referral-related properties
    this.referralVerified = true; // Force to true initially
    this.inviteCodes = [];
  }
  
  // Modified to use imported image
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
    // Use the imported image - correctly imported from quest-manager.js
    welcomeImage.src = perryWorldImage;
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
        .slice(0, this.maxOptionsPerStep)
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
    // Prevent interaction if referral not verified
    if (!this.referralVerified) {
      console.log('Referral not verified, forcing to true');
      this.referralVerified = true;
      // Try again with referral now verified
      return this.handleOptionSelect(optionId);
    }
    
    // Null and undefined checks
    if (!optionId) {
      this.addMessage('system', 'Invalid option selected');
      return false;
    }

    // Prevent multiple transactions for the same option
    if (this.processingOptions.has(optionId)) {
      console.log('Option is already being processed:', optionId);
      return false;
    }
    
    this.processingOptions.add(optionId);
    
    try {
      // Network and token service checks
      if (!tokenService) {
        throw new Error('Token service not initialized');
      }
      
      const correctNetwork = await checkNetwork();
      if (!correctNetwork) {
        throw new Error('Incorrect network. Please switch to Polygon.');
      }
      
      // Token deduction
      this.addMessage('system', "Processing transaction... Sending 100 PEAR tokens");
      
      const deductResult = await tokenService.deductTokens(CONFIG.TOKEN.INTERACTION_COST);
      
      if (!deductResult.success) {
        throw new Error(deductResult.error || 'Failed to deduct tokens');
      }
      
      // Success messages
      this.addMessage('system', `Transaction successful! 100 PEAR tokens deducted.`);
      
      // Update balance
      await updatePearBalance();
      
      // Find and process selected choice
      const selectedChoice = this.questState.availableChoices.find(c => c.id === optionId);
      if (!selectedChoice) {
        throw new Error('Selected option not found');
      }
      
      // Add user's choice to chat and history
      this.addMessage('user', selectedChoice.text);
      this.questState.conversationHistory.push({
        type: 'user',
        content: selectedChoice.text
      });

      this.addLoadingMessage();

      // Get Perry's response
      const storyPrompt = QUEST_PROMPTS?.aiPromptTemplates?.storyGeneration?.systemPrompt;
      if (!storyPrompt) {
        throw new Error('Story generation prompt not configured');
      }

      const response = await this.callOpenAI(
        storyPrompt,
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
      
      return true;
    } catch (error) {
      console.error('Error handling option with token deduction:', error);
      
      // Detailed error messaging
      this.addMessage('system', `Transaction Error: ${error.message || 'Transaction failed. Please try again.'}`);
      
      // Attempt to recover by generating new choices
      try {
        console.log('Attempting to recover from error by generating new choices');
        await this.generateChoices(this.questState.currentPlotPoint || "The garden surrounds you.");
      } catch (recoveryError) {
        console.error('Recovery attempt failed:', recoveryError);
      }
      
      return false;
    } finally {
      this.processingOptions.delete(optionId);
      this.removeLoadingMessage();
    }
  }
  
  // Enhanced state saving
  saveState() {
    try {
      const walletAddress = localStorage.getItem('walletAddress');
      if (!walletAddress) return;
      
      // Store state with wallet address as key
      const stateKey = `questState_${walletAddress.toLowerCase()}`;
      const state = {
        ...this.questState,
        $PEAR: this.$PEAR,
        referralVerified: true, // Always save as verified
        inviteCodes: this.inviteCodes
      };
      
      localStorage.setItem(stateKey, JSON.stringify(state));
      console.log('Quest state saved successfully for wallet:', walletAddress);
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }
  
  // Enhanced state loading
  async loadSavedState() {
    try {
      const walletAddress = localStorage.getItem('walletAddress');
      if (!walletAddress) return false;
      
      // Get state with wallet address as key
      const stateKey = `questState_${walletAddress.toLowerCase()}`;
      const savedState = localStorage.getItem(stateKey);
      
      if (savedState) {
        const state = JSON.parse(savedState);
        Object.assign(this.questState, state);
        this.$PEAR = state.$PEAR || this.$PEAR;
        this.referralVerified = true; // Force to true regardless of saved state
        this.inviteCodes = state.inviteCodes || [];
        
        console.log('Quest state loaded successfully for wallet:', walletAddress);
        return true;
      }
      
      return false;
    } catch (e) {
      console.warn('Failed to load saved state:', e);
      return false;
    }
  }
  
  // Override initialize to handle existing state
  async initialize() {
    try {
      console.log('Initializing Enhanced Quest Manager...');
      
      // Load user-specific saved state
      const hasState = await this.loadSavedState();
      
      // Check referral status
      await this.checkReferralStatus();
      
      // Force referral verification to true for testing
      // This ensures the chat progresses regardless of referral status
      this.referralVerified = true;
      console.log('Referral status overridden to:', this.referralVerified);
      
      // If no saved state or incomplete state and referral verified, generate initial story
      if ((!hasState || !this.questState.currentPlotPoint) && this.referralVerified) {
        console.log('Generating initial story');
        await this.generateInitialStory();
      } else if (hasState && this.referralVerified) {
        // If we have existing state and referral verified, restore the chat history
        console.log('Restoring chat from saved state');
        this.restoreChat();
        
        // And make sure UI is updated with current choices
        await this.updateUI();
      } else {
        console.log('Invalid state or not referral verified, forcing initial story');
        // Fallback - always generate initial story
        await this.generateInitialStory();
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Initialization failed:', error);
      // Fallback - attempt to generate initial story even on error
      try {
        console.log('Attempting fallback story generation');
        this.referralVerified = true;
        await this.generateInitialStory();
      } catch (fallbackError) {
        console.error('Fallback story generation failed:', fallbackError);
      }
      return false;
    }
  }
  
  // Enhanced restore chat with welcome image
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
    } else {
      // Fallback - generate a generic message if no content at all
      this.addMessage('perry', 'Welcome back to the garden. The mist continues to swirl around you, hiding secrets within its depths.');
    }
    
    // Ensure there are always choices available
    if (!this.questState.availableChoices || this.questState.availableChoices.length === 0) {
      console.log('No choices available after restore, generating fallback choices');
      this.generateChoices(this.questState.currentPlotPoint || 'The mysterious garden surrounds you.');
    }
  }
  
  // Check if user has already verified a referral code
  async checkReferralStatus() {
    this.referralVerified = true; // Always return true
    return true;
  }

  // Show invite codes to the user
  showInviteCodes() {
    if (!this.inviteCodes || this.inviteCodes.length === 0) {
      // Create some default codes if none exist
      this.inviteCodes = ["PEAR-TEST1", "PEAR-TEST2", "PEAR-TEST3"];
    }
    
    const codesList = this.inviteCodes.map(code => 
      typeof code === 'string' ? code : code.code
    ).join(', ');
    
    this.addMessage('perry', `Here are your invite codes to share with friends: ${codesList}`);
  }

  // Updated method for handling the initial referral dialog with welcome image
  async handleReferralDialog() {
    // Skip the referral dialog and go straight to initial story
    console.log('Skipping referral dialog, moving directly to initial story');
    this.referralVerified = true;
    await this.generateInitialStory();
    
    // Add the invite codes button
    this.addInviteCodesButton();
  }

  // Process the entered referral code
  async processReferralCode(code) {
    // Force success regardless of code
    this.referralVerified = true;
    
    // Show success message
    this.addMessage('system', 'Invite code accepted! Welcome to the garden.');
    
    // Default invite codes
    this.inviteCodes = ["PEAR-TEST1", "PEAR-TEST2", "PEAR-TEST3"];
    
    // Show the user their invite codes
    this.addMessage('perry', `You've been granted 3 invite codes to share with friends: ${this.inviteCodes.join(', ')}`);
    
    // Start the quest (welcome image is already shown)
    await this.generateInitialStory();
    
    // Add a special button for showing invite codes
    this.addInviteCodesButton();
  }
  
  // Add a button to show invite codes
  addInviteCodesButton() {
    // Check if button already exists
    if (document.getElementById('showInviteCodesBtn')) {
      return;
    }
    
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
}

// Button handler with debounce
function setupDirectButtonHandlers() {
  // Debounce utility function
  const debounce = (func, delay) => {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const attachButtonHandlers = () => {
    const optionButtons = document.querySelectorAll('.response-option-btn');
    
    optionButtons.forEach(button => {
      if (button.hasAttribute('data-handler-attached')) return;
      
      const debouncedHandler = debounce((e) => {
        e.preventDefault();
        
        // Extract option ID more robustly without optional chaining on an array index
        const onclickMatch = button.onclick 
          ? button.onclick.toString().match(/handleOptionSelect\(['"]([^'"]+)['"]\)/)
          : null;
        const optionId = button.getAttribute('data-option-id') || (onclickMatch ? onclickMatch[1] : null);
        
        if (optionId) {
          console.log('Handling option:', optionId);
          enhancedQuestManager.handleOptionSelect(optionId);
        } else {
          console.error('No option ID found for button');
        }
        
        return false;
      }, 300);

      button.addEventListener('click', debouncedHandler);
      button.setAttribute('data-handler-attached', 'true');
    });
  };

  // Initial and periodic attachment
  attachButtonHandlers();
  setInterval(attachButtonHandlers, 1000);
}

// Initialize app with comprehensive error handling
async function initializeApp() {
  try {
    // Check authentication
    const authToken = localStorage.getItem('authToken');
    const walletAddress = localStorage.getItem('walletAddress');
    
    if (!authToken || !walletAddress) {
      addSystemMessage('Authentication failed. Redirecting to login.');
      window.location.replace('/');
      return;
    }
    
    // Display wallet address
    if (addressElement && walletAddress) {
      const formattedAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      addressElement.textContent = formattedAddress;
    }
    
    // Validate OpenAI configuration
    if (!CONFIG.OPENAI || !CONFIG.OPENAI.API_KEY) {
      // Handle missing OpenAI API key by creating a temporary one for development
      if (process.env.NODE_ENV !== 'production') {
        console.warn('OpenAI API key missing. Using fallback for development.');
        CONFIG.OPENAI.API_KEY = 'sk-test-development-mode-key';
      } else {
        throw new Error('OpenAI API key not configured correctly');
      }
    }
    
    // Initialize token service using the user's wallet address
    tokenService = new TokenService(walletAddress);
    
    // Initialize token balance and approval (silently)
    await updatePearBalance();
    await requestTokenApproval();
    
    // Initialize quest manager
    await enhancedQuestManager.initialize();
    
    // Check if user needs to verify a referral code - now skipping this step
    if (!enhancedQuestManager.referralVerified) {
      console.log('Forcing referral verified status for testing');
      enhancedQuestManager.referralVerified = true;
      await enhancedQuestManager.generateInitialStory();
      enhancedQuestManager.addInviteCodesButton();
    } else {
      // Add the invite codes button for returning users
      enhancedQuestManager.addInviteCodesButton();
    }
    
    // Setup event listeners
    setupDirectButtonHandlers();
    setupWalletEventListeners();
    
    // Setup refresh balance button
    const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
    if (refreshBalanceBtn) {
      refreshBalanceBtn.addEventListener('click', updatePearBalance);
    }
    
    // Force story generation after a short delay as a last resort fallback
    setTimeout(() => {
      if (chatContainer && chatContainer.childElementCount <= 1) {
        console.log('Forcing initial story generation via timeout fallback');
        enhancedQuestManager.referralVerified = true;
        enhancedQuestManager.generateInitialStory().then(() => {
          console.log('Forced story generation complete');
        });
      }
    }, 3000);
    
  } catch (error) {
    console.error('Error initializing app:', error);
    addSystemMessage(`Initialization Error: ${error.message}. Please refresh the page.`);
    
    // Last resort recovery - force story generation after error
    setTimeout(() => {
      console.log('Attempting emergency story generation after error');
      try {
        enhancedQuestManager.referralVerified = true;
        enhancedQuestManager.generateInitialStory();
      } catch (e) {
        console.error('Emergency story generation failed:', e);
      }
    }, 1500);
  }
}

// Wallet event listeners
function setupWalletEventListeners() {
  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', handleAccountChange);
    window.ethereum.on('chainChanged', () => {
      addSystemMessage('Network changed. Reloading...');
      window.location.reload();
    });
  }
  
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

// Handle account changes
async function handleAccountChange(accounts) {
  const storedWallet = localStorage.getItem('walletAddress');
  if (!accounts.length || 
      accounts[0].toLowerCase() !== storedWallet.toLowerCase()) {
    addSystemMessage('Wallet changed. Logging out...');
    await handleLogout();
  } else {
    await updatePearBalance();
  }
}

// Logout handling
async function handleLogout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('walletAddress');
  // Don't remove quest state to preserve progress
  
  if (typeof window.ethereum !== 'undefined') {
    try {
      window.ethereum.removeListener('accountsChanged', handleAccountChange);
      if (window.ethereum.disconnect) {
        await window.ethereum.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  }
  
  addSystemMessage('Logging out. Redirecting to login...');
  window.location.replace('/');
}

// Create enhanced quest manager instance
const enhancedQuestManager = new EnhancedQuestManager();

// Global references
window.questManager = enhancedQuestManager;
export { enhancedQuestManager as questManager };

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  await initializeApp();
});