// src/main.js
import { saveUserWallet } from './api';

console.log('🚀 Initializing main.js v1.0.3 (MetaMask-only with Polygon check)');

// Utility function for error reporting
const logError = (context, error) => {
    console.error(`❌ ERROR [${context}]:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        error
    });
};

// Check if MetaMask is connected to Polygon Mainnet
const checkPolygonNetwork = async () => {
    console.log('🔍 Checking network...');
    
    if (!window.ethereum) {
        console.error('MetaMask not installed');
        return false;
    }
    
    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const requiredChainId = '0x89'; // Polygon Mainnet
        
        console.log(`Current chain ID: ${chainId}, Required: ${requiredChainId}`);
        
        if (chainId !== requiredChainId) {
            // Show the network switch modal
            const networkModal = document.getElementById('network-switch-modal');
            if (networkModal) {
                networkModal.style.display = 'block';
            }
            
            return false;
        }
        
        return true;
    } catch (error) {
        logError('Network Check', error);
        return false;
    }
};

// Function to switch network to Polygon
const switchToPolygon = async () => {
    console.log('🔄 Attempting to switch to Polygon Mainnet');
    
    if (!window.ethereum) {
        alert('MetaMask not installed! Please install MetaMask to use this application.');
        return false;
    }
    
    try {
        // Try to switch to Polygon network
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x89' }], // Polygon Mainnet
        });
        
        // Hide the modal after successful switch
        const networkModal = document.getElementById('network-switch-modal');
        if (networkModal) {
            networkModal.style.display = 'none';
        }
        
        return true;
    } catch (switchError) {
        // Handle the case where the chain has not been added to MetaMask
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x89',
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: {
                            name: 'MATIC',
                            symbol: 'MATIC',
                            decimals: 18
                        },
                        rpcUrls: ['https://polygon-rpc.com/'],
                        blockExplorerUrls: ['https://polygonscan.com/']
                    }]
                });
                
                // Hide the modal after successful addition
                const networkModal = document.getElementById('network-switch-modal');
                if (networkModal) {
                    networkModal.style.display = 'none';
                }
                
                return true;
            } catch (addError) {
                logError('Adding Polygon Network', addError);
                alert(`Error adding Polygon network: ${addError.message}`);
                return false;
            }
        }
        
        logError('Switching Network', switchError);
        alert(`Error switching to Polygon network: ${switchError.message}`);
        return false;
    }
};

// Simple direct MetaMask connection function
const connectWithMetaMask = async () => {
    console.log('⚡ Attempting MetaMask connection');
    
    if (!window.ethereum) {
        alert('MetaMask not installed! Please install MetaMask to use this application.');
        throw new Error('MetaMask not installed');
    }
    
    try {
        // Show loading indicator
        const loadingDiv = document.getElementById('connection-loading');
        if (loadingDiv) loadingDiv.style.display = 'block';
        
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log('📊 Accounts received:', accounts);
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts available');
        }
        
        // Check if we're on Polygon network
        const isPolygon = await checkPolygonNetwork();
        if (!isPolygon) {
            // The modal is already shown by checkPolygonNetwork
            if (loadingDiv) loadingDiv.style.display = 'none';
            return false;
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
    } finally {
        // Hide loading indicator
        const loadingDiv = document.getElementById('connection-loading');
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
};

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded');
    
    // Connect button
    const connectButton = document.getElementById('open-connect-modal');
    if (connectButton) {
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
    } else {
        console.error('❌ Connect button not found in DOM');
    }
    
    // Network modal close button
    const closeModalButton = document.getElementById('close-network-modal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            const modal = document.getElementById('network-switch-modal');
            if (modal) modal.style.display = 'none';
        });
    }
    
    // Switch network button
    const switchNetworkButton = document.getElementById('switch-to-polygon');
    if (switchNetworkButton) {
        switchNetworkButton.addEventListener('click', async () => {
            await switchToPolygon();
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('network-switch-modal');
        if (modal && event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Check if MetaMask is installed
    if (!window.ethereum) {
        const metamaskNotInstalledDiv = document.getElementById('metamask-not-installed');
        if (metamaskNotInstalledDiv) {
            metamaskNotInstalledDiv.style.display = 'block';
        }
        
        if (connectButton) {
            connectButton.disabled = true;
            connectButton.innerHTML = 'MetaMask Not Installed';
        }
    }
});