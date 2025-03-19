// src/api.js
/**
 * Save user wallet address to the database
 * @param {string} address - Ethereum wallet address
 * @returns {Promise<Object>} Response object with success status and auth token
 */
export const saveUserWallet = async (address) => {
    console.log('🚀 saveUserWallet called with:', address);
    
    if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.error('❌ Invalid wallet address format:', address);
        return {
            success: false,
            error: 'Invalid wallet address format'
        };
    }
    
    try {
        const requestData = { walletAddress: address };
        console.log('📦 Request payload:', requestData);
        
        // Check for network connectivity before making the request
        if (!navigator.onLine) {
            throw new Error('No internet connection. Please check your network and try again.');
        }
        
        console.log('📡 Making API request to:', '/api/users/login');
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('📥 Response status:', response.status);
        
        // Handle different HTTP status codes
        if (response.status === 404) {
            throw new Error('API endpoint not found. Server might be down or misconfigured.');
        }
        
        if (response.status === 429) {
            throw new Error('Too many requests. Please try again later.');
        }
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}, message: ${data.message || 'Unknown error'}`);
        }
        
        if (!data.success) {
            throw new Error(`API error: ${data.message || 'Failed to save user data'}`);
        }
        
        console.log('✅ API call successful:', data);
        return data;
    } catch (error) {
        console.error('❌ API Error:', {
            message: error.message,
            stack: error.stack,
            originalError: error
        });
        
        // If the server is unreachable, provide a temporary auth token for development
        if (error.message.includes('Failed to fetch') || error.message.includes('API endpoint not found')) {
            console.warn('⚠️ Server unreachable, generating temporary auth token for development');
            
            // Only in development mode, provide a fallback
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return {
                    success: true,
                    auth_token: 'temp_dev_token_' + Math.random().toString(36).substring(2, 15),
                    message: 'Development fallback activated - server unreachable'
                };
            }
        }
        
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }
};