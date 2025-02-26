// app.js
import { questManager } from './quest-manager.js';
import { CONFIG } from './quest-config.js';

// Debug environment variables
function debugEnvironment() {
  console.log("Environment check:");
  console.log("VITE env available:", !!import.meta.env);
  console.log("OpenAI API Key exists:", !!import.meta.env.VITE_OPENAI_API_KEY);
  console.log("CONFIG loaded:", !!CONFIG);
  console.log("CONFIG.OPENAI exists:", !!CONFIG.OPENAI);
  if (CONFIG.OPENAI) {
    console.log("API Key in CONFIG exists:", !!CONFIG.OPENAI.API_KEY);
    if (CONFIG.OPENAI.API_KEY) {
      const keyPrefix = CONFIG.OPENAI.API_KEY.substring(0, 5);
      console.log(`API Key starts with: ${keyPrefix}... (${CONFIG.OPENAI.API_KEY.length} chars)`);
    }
  }
}

let chatContainer;
let responseOptions;
let questStatus;
let addressElement;

function initializeElements() {
  chatContainer = document.getElementById('chatContainer');
  responseOptions = document.getElementById('responseOptions');
  questStatus = document.getElementById('questStatus');
  addressElement = document.getElementById('address');
}

async function initializeApp() {
  try {
    // Run environment debug check
    debugEnvironment();
    
    // Check authentication
    const authToken = localStorage.getItem('authToken');
    const walletAddress = localStorage.getItem('walletAddress');
    
    if (!authToken || !walletAddress) {
      window.location.replace('/');
      return;
    }
    
    // Display wallet address if exists
    if (addressElement && walletAddress) {
      const formattedAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      addressElement.textContent = formattedAddress;
    }
    
    // Verify OpenAI API key is available before initializing quest manager
    if (!CONFIG.OPENAI || !CONFIG.OPENAI.API_KEY) {
      throw new Error('OpenAI API key not configured correctly');
    }
    
    await questManager.initialize();
    addWelcomeMessage();
    setupEventListeners();
  } catch (error) {
    console.error('Error initializing app:', error);
    addSystemMessage(`Error initializing the quest system: ${error.message}. Please refresh the page.`);
  }
}

// Rest of your code remains the same...