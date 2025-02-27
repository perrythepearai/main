// app.js
import { questManager } from './quest-manager.js';
import { CONFIG } from './quest-config.js';
import { QUEST_PROMPTS } from './quest-prompts.js';
import { TokenService } from './token-service.js';

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
      <span class="message-icon">ℹ️</span>
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
    addSystemMessage('Token service not initialized');
    return false;
  }

  addSystemMessage("Requesting PEAR token approval for quest interactions...");
  
  try {
    const result = await tokenService.approveTokenSpending();
    if (result.success) {
      approvalCompleted = true;
      addSystemMessage("✅ PEAR tokens approved successfully!");
      return true;
    } else {
      addSystemMessage(`❌ Token approval failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    addSystemMessage(`Error during token approval: ${error.message}`);
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
    
    addSystemMessage(`Current $PEAR balance: ${balance}`);
  } catch (error) {
    console.error('Error updating PEAR balance:', error);
    if (tokenDisplayElement) {
      tokenDisplayElement.textContent = '? $PEAR';
    }
    addSystemMessage(`Failed to update balance: ${error.message}`);
  }
}

// Enhanced Quest Manager
class EnhancedQuestManager extends originalQuestManager.constructor {
  constructor() {
    super();
    this.processingOptions = new Set();
    this.maxOptionsPerStep = 4;
  }
  
  async generateChoices(context) {
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
    } catch (error) {
      console.error('Error generating choices:', error);
      this.addMessage('system', 'Error generating story options. Please try again.');
    }
  }
  
  async handleOptionSelect(optionId) {
    // Null and undefined checks
    if (!optionId) {
      this.addMessage('system', 'Invalid option selected');
      return false;
    }

    // Prevent multiple transactions for the same option
    if (this.processingOptions.has(optionId)) {
      this.addMessage('system', 'This option is already being processed.');
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
      throw new Error('OpenAI API key not configured correctly');
    }
    
    // Initialize token service using the user's wallet address
    tokenService = new TokenService(walletAddress);
    
    // Initialize token balance and approval
    await updatePearBalance();
    await requestTokenApproval();
    
    // Initialize quest manager
    await enhancedQuestManager.initialize();
    
    // Welcome message
    addSystemMessage('Welcome to the Green Mist quest. The garden awaits your exploration...');
    
    // Setup event listeners
    setupDirectButtonHandlers();
    setupWalletEventListeners();
    
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
  localStorage.removeItem('questState');
  
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
