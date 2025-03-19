// token-service.js
import { ethers } from 'ethers';
import { CONFIG } from './quest-config.js';

// Simple ERC20 ABI with just the methods we need
const TOKEN_ABI = [
    // Transfer function (direct token transfer without approval)
    "function transfer(address to, uint256 amount) returns (bool)",
    // Read-only functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

export class TokenService {
    constructor(walletAddress) {
        this.walletAddress = walletAddress;
        this.tokenAddress = CONFIG.TOKEN.PEAR_TOKEN_ADDRESS;
        this.masterWalletAddress = CONFIG.TOKEN.MASTER_WALLET_ADDRESS;
        this.provider = null;
        this.tokenContract = null;
        this.decimals = 18; // Default, will be updated when initialized
        this.initialized = false;
        this.initPromise = this.initialize();
    }

    async initialize() {
        try {
            // Initialize provider
            if (window.ethereum) {
                this.provider = new ethers.providers.Web3Provider(window.ethereum);
                
                // Get the network to verify we're on the right chain
                const network = await this.provider.getNetwork();
                const correctChainId = parseInt(CONFIG.TOKEN.REQUIRED_CHAIN_ID, 16);
                
                if (network.chainId !== correctChainId) {
                    console.warn(`Wrong network: ${network.chainId}, expected: ${correctChainId}`);
                    return false;
                }
                
                // Initialize token contract
                this.tokenContract = new ethers.Contract(
                    this.tokenAddress,
                    TOKEN_ABI,
                    this.provider
                );
                
                // Get decimals
                try {
                    this.decimals = await this.tokenContract.decimals();
                } catch (error) {
                    console.warn("Could not get token decimals, using default 18:", error);
                    this.decimals = 18;
                }
                
                this.initialized = true;
                console.log(`Token service initialized for ${this.walletAddress}`);
                return true;
            } else {
                console.error("Ethereum provider not found");
                return false;
            }
        } catch (error) {
            console.error("Failed to initialize token service:", error);
            return false;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initPromise;
            if (!this.initialized) {
                throw new Error("Token service failed to initialize");
            }
        }
    }

    async getPearBalance() {
        try {
            await this.ensureInitialized();
            
            // Get balance
            const balance = await this.tokenContract.balanceOf(this.walletAddress);
            
            // Format with correct decimals
            const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
            return parseInt(formattedBalance);
        } catch (error) {
            console.error("Error getting PEAR balance:", error);
            return 0; // Return 0 on error as a fallback
        }
    }

    /**
     * Send PEAR tokens to the master wallet as payment for quest interaction
     * Uses direct transfer() instead of approve + transferFrom pattern
     * This avoids the need for a separate approval transaction
     * @param {number} amount - Amount of PEAR tokens to deduct
     * @returns {Object} - Success status and transaction hash or error
     */
    async deductTokens(amount) {
        try {
            await this.ensureInitialized();
            
            // Convert amount to token units
            const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
            
            // Check if user has enough balance
            const balance = await this.tokenContract.balanceOf(this.walletAddress);
            if (balance.lt(tokenAmount)) {
                return {
                    success: false,
                    error: `Insufficient PEAR balance. You have ${ethers.utils.formatUnits(balance, this.decimals)} but need ${amount}`
                };
            }
            
            // Get signer
            const signer = this.provider.getSigner();
            const tokenWithSigner = this.tokenContract.connect(signer);
            
            // Send tokens directly to master wallet
            // This avoids the need for a separate approval transaction
            console.log(`Sending ${amount} PEAR to ${this.masterWalletAddress}`);
            const tx = await tokenWithSigner.transfer(this.masterWalletAddress, tokenAmount);
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
            return {
                success: true,
                hash: receipt.transactionHash
            };
        } catch (error) {
            console.error("Error deducting tokens:", error);
            
            // Provide more meaningful error messages
            let errorMessage = "Transaction failed. Please try again.";
            
            if (error.code === 4001) {
                errorMessage = "Transaction rejected by user.";
            } else if (error.message.includes("insufficient funds")) {
                errorMessage = "Insufficient ETH for gas fees.";
            } else if (error.message.includes("execution reverted")) {
                errorMessage = "Transaction reverted. Check your PEAR balance.";
            }
            
            return {
                success: false,
                error: errorMessage,
                originalError: error.message
            };
        }
    }
    
    // Keep this method for backward compatibility, but make it a no-op
    async approveTokenSpending() {
        console.log('Token approval skipped - using direct transfers instead');
        return { success: true };
    }
}

export default TokenService;