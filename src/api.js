// src/api.js
export const saveUserWallet = async (address) => {
    console.log('🚀 saveUserWallet called with:', address);
    
    try {
        const requestData = { walletAddress: address };
        console.log('📦 Request payload:', requestData);
        
        console.log('📡 Making API request to:', '/api/users/login');
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('📥 Response status:', response.status);
        
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
        throw error;
    }
};