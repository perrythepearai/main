// src/main.js
import { saveUserWallet } from './api';

console.log('🚀 Initializing main.js v1.0.2 (MetaMask-only)');

// Utility function for error reporting
const logError = (context, error) => {
    console.error(`❌ ERROR [${context}]:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        error
    });
};

// Simple direct MetaMask connection function
const connectWithMetaMask = async () => {
    console.log('⚡ Attempting MetaMask connection');
    
    if (!window.ethereum) {
        alert('MetaMask not installed! Please install MetaMask to use this application.');
        throw new Error('MetaMask not installed');
    }
    
    try {
        // Request account access
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
        alert(`Connection error: ${error.message}`);
        return false;
    }
};

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
            await connectWithMetaMask();
        } catch (error) {
            logError('Connection Handler', error);
            alert(`Connection error: ${error.message}`);
        }
    });
});