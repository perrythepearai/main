// app.js
import { CONFIG } from './quest-config.js';
import { questManager } from './quest-manager.js';

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

        await questManager.initialize();
        addWelcomeMessage();
        setupEventListeners();

    } catch (error) {
        console.error('Error initializing app:', error);
        addSystemMessage('Error initializing the quest system. Please refresh the page.');
    }
}

function addWelcomeMessage() {
    if (chatContainer) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message system-message';
        welcomeDiv.textContent = 'Welcome to the Green Mist quest. The garden awaits your exploration...';
        chatContainer.appendChild(welcomeDiv);
    }
}

function addSystemMessage(content) {
    if (chatContainer) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.innerHTML = `
            <i class="material-icons">info</i>
            ${content}
        `;
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function setupEventListeners() {
    // Setup MetaMask events
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.on('accountsChanged', handleAccountChange);
        window.ethereum.on('chainChanged', () => window.location.reload());
    }

    // Add logout button handler
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

async function handleAccountChange(accounts) {
    const storedWallet = localStorage.getItem('walletAddress');
    if (accounts.length === 0 || 
        accounts[0].toLowerCase() !== storedWallet.toLowerCase()) {
        await handleLogout();
    }
}

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
    
    window.location.replace('/');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    initializeElements();
    await initializeApp();
});