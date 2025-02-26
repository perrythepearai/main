// src/main.js
import { createAppKit } from '@reown/appkit';
import { Ethers5Adapter } from '@reown/appkit-adapter-ethers5';
import { mainnet, arbitrum } from '@reown/appkit/networks';
import { saveUserWallet } from './api';


console.log('🚀 Initializing main.js v1.0.1');

// Utility function for error reporting
const logError = (context, error) => {
    console.error(`❌ ERROR [${context}]:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        error
    });
};

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'fallbackProjectId';
const metadata = {
    name: 'PerrypearAI',
    description: 'AppKit Example',
    url: 'https://hi.perrythepear.com',
    icons: ['https://assets.reown.com/reown-profile-pic.png']
};

// Create a simpler direct connection function
const connectWithMetaMask = async () => {
    console.log('⚡ Attempting direct MetaMask connection');
    
    if (!window.ethereum) {
        throw new Error('MetaMask not installed');
    }
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log('📊 Accounts received:', accounts);
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts available');
        }
        
        const walletAddress = accounts[0].toLowerCase();
        console.log('✅ Wallet connected:', walletAddress);
        
        // Save to database
        const result = await saveUserWallet(walletAddress);
        console.log('💾 Save result:', result);
        
        if (!result.success) {
            throw new Error(`Database save failed: ${result.error || 'Unknown error'}`);
        }
        
        // Set storage and redirect
        localStorage.setItem('authToken', result.auth_token);
        localStorage.setItem('walletAddress', walletAddress);
        
        window.location.href = `/coming-soon.html/${walletAddress}`;
        return true;
    } catch (error) {
        logError('MetaMask Connection', error);
        return false;
    }
};

// Create Reown instance
let modal;
try {
    console.log('⚙️ Creating Reown instance');
    modal = createAppKit({
        adapters: [new Ethers5Adapter()],
        networks: [mainnet, arbitrum],
        metadata,
        projectId,
        features: {
            analytics: true
        }
    });
    console.log('✅ Reown instance created successfully');
} catch (error) {
    logError('Reown Creation', error);
    console.warn('⚠️ Proceeding without Reown - will use direct connection');
}

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded');
    const connectButton = document.getElementById('open-connect-modal');
    
    if (!connectButton) {
        console.error('❌ Connect button not found in DOM');
        return;
    }
    
    console.log('🔘 Connect button found');
    
    connectButton.addEventListener('click', async () => {
        console.log('🔌 Connect button clicked');
        
        try {
            // First try direct MetaMask connection
            console.log('🔍 Trying direct connection first');
            const directSuccess = await connectWithMetaMask();
            
            if (directSuccess) {
                console.log('✅ Direct connection successful');
                return;
            }
            
            // If direct connection fails and Reown is available, try that
            if (modal) {
                console.log('🔄 Direct connection failed, trying Reown');
                await modal.open();
                console.log('🔓 Reown modal opened');
                
                // Set a timeout to check if connection was successful
                setTimeout(() => {
                    if (!localStorage.getItem('walletAddress')) {
                        console.log('⏱️ No wallet connection after timeout');
                        alert('Connection timed out. Please try again.');
                    }
                }, 15000);
            } else {
                console.error('❌ Both connection methods failed');
                alert('Unable to connect to wallet. Please make sure MetaMask is installed and unlocked.');
            }
        } catch (error) {
            logError('Connection Handler', error);
            alert(`Connection error: ${error.message}`);
        }
    });
});