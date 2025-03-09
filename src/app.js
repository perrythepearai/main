// app.js
import { questManager } from './quest-manager.js';
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

// Token approval function
async function requestTokenApproval() {
  if (!tokenService) {
    return false;
  }

  try {
    const result = await tokenService.approveTokenSpending();
    if (result.success) {
      approvalCompleted = true;
      return true;
    } else {
      console.error('Token approval failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('Error during token approval:', error.message);
    return false;
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
    this.referralVerified = false;
    this.inviteCodes = [];
  }
  
  async generateChoices(context) {
    // Skip generating choices if referral not verified
    if (!this.referralVerified) {
      console.log('Skipping choice generation - referral not verified');
      return;
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

      this.questState.availableChoices = choicesList;
      await this.updateUI();
      this.saveState(); // Save state after generating new choices
    } catch (error) {
      console.error('Error generating choices:', error);
      this.addMessage('system', 'Error generating story options. Please try again.');
    }
  }
  
  async handleOptionSelect(optionId) {
    // Prevent interaction if referral not verified
    if (!this.referralVerified) {
      this.addMessage('system', 'Please enter an invite code to begin your journey.');
      return false;
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
        referralVerified: this.referralVerified,
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
        this.referralVerified = state.referralVerified || false;
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
      console.log('Initializing Quest Manager...');
      
      // Load user-specific saved state
      const hasState = await this.loadSavedState();
      
      // Check referral status
      await this.checkReferralStatus();
      
      // If no saved state or incomplete state and referral verified, generate initial story
      if ((!hasState || !this.questState.currentPlotPoint) && this.referralVerified) {
        await this.generateInitialStory();
      } else if (hasState && this.referralVerified) {
        // If we have existing state and referral verified, restore the chat history
        this.restoreChat();
        
        // And make sure UI is updated with current choices
        await this.updateUI();
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Initialization failed:', error);
      return false;
    }
  }
  
  // Restore chat from saved history
  restoreChat() {
    // Clear chat first
    if (chatContainer) {
      chatContainer.innerHTML = '';
    }
    
    // Rebuild chat from history
    if (this.questState.conversationHistory && this.questState.conversationHistory.length > 0) {
      this.questState.conversationHistory.forEach(message => {
        this.addMessage(message.type, message.content);
      });
    } else if (this.questState.currentPlotPoint) {
      // If we have a current plot point but no history, just show that
      this.addMessage('perry', this.questState.currentPlotPoint);
    }
  }
  
  // Check if user has already verified a referral code
  async checkReferralStatus() {
    try {
      // First check localStorage for referralVerified flag
      const walletAddress = localStorage.getItem('walletAddress');
      if (!walletAddress) return false;
      
      const stateKey = `questState_${walletAddress.toLowerCase()}`;
      const savedState = localStorage.getItem(stateKey);
      
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.referralVerified) {
          this.referralVerified = true;
          return true;
        }
      }
      
      // If not found in localStorage, check with the server
      // This is commented out for now since the endpoint doesn't exist yet
      /*
      const response = await fetch(`/api/referral/status/${walletAddress}`);
      const data = await response.json();
      
      if (data.success) {
        this.referralVerified = data.hasUsedInviteCode;
        return this.referralVerified;
      }
      */
      
      // For now, default to false (not verified)
      return false;
    } catch (error) {
      console.error('Error checking referral status:', error);
      return false;
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
      
      // This is a temporary validation since the endpoint doesn't exist yet
      // We'll accept any code that starts with "PEAR-" for testing
      if (code.trim().toUpperCase().startsWith('PEAR-')) {
        this.referralVerified = true;
        this.inviteCodes = ["PEAR-XYZ1", "PEAR-XYZ2", "PEAR-XYZ3"];
        
        // Save to localStorage
        this.saveState();
        
        return {
          success: true,
          message: 'Invite code accepted!',
          inviteCodes: this.inviteCodes
        };
      }
      
      // When the endpoint is ready, uncomment this
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
        
        // Save to localStorage
        this.saveState();
        
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
      
      return {
        success: false,
        error: 'Invalid invite code. It should start with PEAR-'
      };
    } catch (error) {
      console.error('Error verifying referral code:', error);
      return {
        success: false,
        error: 'Error verifying code. Please try again.'
      };
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
      
      // Start the quest
      await this.generateInitialStory();
      
      // Add a special button for showing invite codes
      this.addInviteCodesButton();
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
    // Remove existing button if any
    const existingContainer = document.querySelector('.invite-codes-container');
    if (existingContainer) {
      existingContainer.remove();
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
    
    // Check if user needs to verify a referral code
    if (!enhancedQuestManager.referralVerified) {
      await enhancedQuestManager.handleReferralDialog();
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
    
  } catch (error) {
    console.error('Error initializing app:', error);
    addSystemMessage(`Initialization Error: ${error.message}. Please refresh the page.`);
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