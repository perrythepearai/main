// token-service.js
import { ethers } from 'ethers';
import { CONFIG } from './quest-config.js';

// PEAR Token contract address on Polygon
const PEAR_TOKEN_ADDRESS = CONFIG.TOKEN.PEAR_TOKEN_ADDRESS;

// Basic ERC20 ABI for token balance and transfers
const ERC20_ABI = [
  // Read-only functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // Write functions
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

export class TokenService {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.tokenAddress = PEAR_TOKEN_ADDRESS;
    this.decimals = 18; // Default ERC20 decimals, will be updated when connected
    this.provider = null;
    this.contract = null;
    this.masterWalletAddress = CONFIG.MASTER_WALLET_ADDRESS;
  }

  async connect() {
    try {
      console.log('Attempting to connect to wallet...');
      // Connect to provider with user's MetaMask
      if (window.ethereum) {
        console.log('MetaMask found, connecting...');
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        
        console.log('Creating contract instance...');
        // Create contract instance
        this.contract = new ethers.Contract(
          this.tokenAddress,
          ERC20_ABI,
          this.signer
        );
        
        // Get token decimals
        try {
          this.decimals = await this.contract.decimals();
          console.log('Token decimals:', this.decimals);
        } catch (error) {
          console.warn('Could not get decimals, using default:', error);
        }
        
        console.log('Wallet connection successful');
        return true;
      } else {
        console.error('MetaMask not available');
        throw new Error('MetaMask not available');
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      return false;
    }
  }

  async getPearBalance() {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      
      // Get balance from contract
      const balance = await this.contract.balanceOf(this.walletAddress);
      
      // Format balance using decimals
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      
      return Math.floor(parseFloat(formattedBalance)); // Return integer value
    } catch (error) {
      console.error('Error fetching PEAR balance:', error);
      return 0;
    }
  }
  
  async deductTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) {
          throw new Error('Could not connect to wallet');
        }
      }
      
      if (!this.masterWalletAddress) {
        throw new Error('Master wallet address not configured');
      }
      
      // Check if current balance is sufficient
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      // Convert amount to token units
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Send transaction to master wallet
      const tx = await this.contract.transfer(this.masterWalletAddress, tokenAmount);
      
      console.log('Transaction submitted:', tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      // Get updated balance
      const newBalance = await this.getPearBalance();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        remainingBalance: newBalance
      };
    } catch (error) {
      console.error('Token deduction error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process token deduction'
      };
    }
  }

  // Method to check if tokens are already approved
  async checkAllowance() {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      
      if (!this.masterWalletAddress) {
        throw new Error('Master wallet address not configured');
      }
      
      const allowance = await this.contract.allowance(this.walletAddress, this.masterWalletAddress);
      const formattedAllowance = ethers.utils.formatUnits(allowance, this.decimals);
      
      console.log('Current allowance:', formattedAllowance);
      return parseFloat(formattedAllowance);
    } catch (error) {
      console.error('Error checking allowance:', error);
      return 0;
    }
  }

  // Method to pre-approve tokens for future transfers
  async approveTokenSpending(amount = 100000) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) {
          throw new Error('Could not connect to wallet');
        }
      }
      
      // Get the master wallet address from config
      const spenderAddress = this.masterWalletAddress;
      
      if (!spenderAddress) {
        throw new Error('Master wallet address not configured');
      }
      
      // Check if already approved
      const currentAllowance = await this.checkAllowance();
      if (currentAllowance >= amount) {
        console.log('Already approved enough tokens:', currentAllowance);
        return {
          success: true,
          txHash: 'already-approved'
        };
      }
      
      // Convert amount to token units (approve a large amount to avoid future approvals)
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Call the ERC20 approve function
      const tx = await this.contract.approve(spenderAddress, tokenAmount);
      console.log('Approval transaction submitted:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Approval confirmed:', receipt);
      
      return {
        success: true,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Token approval error:', error);
      return {
        success: false,
        error: error.message || 'Failed to approve tokens'
      };
    }
  }

  // Method to transfer pre-approved tokens
  async transferPreApprovedTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) {
          throw new Error('Could not connect to wallet');
        }
      }
      
      // Get master wallet address
      const recipientAddress = this.masterWalletAddress;
      
      if (!recipientAddress) {
        throw new Error('Recipient address not configured');
      }
      
      // Check if current balance is sufficient
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      // Check allowance
      const allowance = await this.checkAllowance();
      if (allowance < amount) {
        throw new Error(`Insufficient allowance. Please approve token spending first.`);
      }
      
      // Convert amount to token units
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Transfer the tokens
      const tx = await this.contract.transfer(recipientAddress, tokenAmount);
      console.log('Transfer transaction submitted:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Transfer confirmed:', receipt);
      
      // Get updated balance
      const newBalance = await this.getPearBalance();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        remainingBalance: newBalance
      };
    } catch (error) {
      console.error('Token transfer error:', error);
      return {
        success: false,
        error: error.message || 'Failed to transfer tokens'
      };
    }
  }
}