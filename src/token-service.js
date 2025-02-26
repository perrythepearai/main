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

  // Connect to MetaMask and create a contract instance.
  async connect() {
    try {
      console.log('Attempting to connect to wallet...');
      if (window.ethereum) {
        console.log('MetaMask found, connecting...');
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        await this.provider.send("eth_requestAccounts", []);
        this.signer = this.provider.getSigner();
        console.log('Creating contract instance...');
        this.contract = new ethers.Contract(this.tokenAddress, ERC20_ABI, this.signer);
        // Try to get token decimals from the contract.
        try {
          this.decimals = await this.contract.decimals();
          console.log('Token decimals:', this.decimals);
        } catch (error) {
          console.warn('Could not get decimals, using default:', error);
        }
        console.log('Wallet connection successful');
        return true;
      } else {
        throw new Error('MetaMask not available');
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      return false;
    }
  }

  // Retrieve the user's $PEAR balance.
  async getPearBalance() {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      const balance = await this.contract.balanceOf(this.walletAddress);
      return Math.floor(parseFloat(ethers.utils.formatUnits(balance, this.decimals)));
    } catch (error) {
      console.error('Error fetching PEAR balance:', error);
      return 0;
    }
  }
  
  // Deduct tokens by transferring them to the master wallet.
  // Note: This transaction will prompt the user to sign via MetaMask.
  async deductTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error('Could not connect to wallet');
      }
      if (!this.masterWalletAddress) throw new Error('Master wallet address not configured');
      
      // Check if the user has sufficient balance.
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      // Convert the amount to token units.
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      const tx = await this.contract.transfer(this.masterWalletAddress, tokenAmount);
      console.log('Transaction submitted:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      const newBalance = await this.getPearBalance();
      return { success: true, txHash: receipt.transactionHash, remainingBalance: newBalance };
    } catch (error) {
      console.error('Token deduction error:', error);
      return { success: false, error: error.message || 'Failed to process token deduction' };
    }
  }
  
  // Check how many tokens have been approved for spending.
  async checkAllowance() {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      if (!this.masterWalletAddress) throw new Error('Master wallet address not configured');
      
      const allowance = await this.contract.allowance(this.walletAddress, this.masterWalletAddress);
      const formattedAllowance = ethers.utils.formatUnits(allowance, this.decimals);
      console.log('Current allowance:', formattedAllowance);
      return parseFloat(formattedAllowance);
    } catch (error) {
      console.error('Error checking allowance:', error);
      return 0;
    }
  }
  
  // Approve tokens for future spending with a fallback manual gas limit.
  async approveTokenSpending(amount = 100000) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error('Could not connect to wallet');
      }
      
      const spenderAddress = this.masterWalletAddress;
      if (!spenderAddress) throw new Error('Master wallet address not configured');
      
      // Check if already enough tokens are approved.
      const currentAllowance = await this.checkAllowance();
      if (currentAllowance >= amount) {
        console.log('Already approved enough tokens:', currentAllowance);
        return { success: true, txHash: 'already-approved' };
      }
      
      // Convert the approval amount to token units.
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      let tx;
      
      try {
        // Try submitting the approval transaction normally.
        tx = await this.contract.approve(spenderAddress, tokenAmount);
      } catch (error) {
        // If gas estimation fails, try again with a manual gas limit.
        if (
          error.code === 'UNPREDICTABLE_GAS_LIMIT' ||
          error.message.includes('cannot estimate gas')
        ) {
          console.warn('Gas estimation failed, retrying with manual gas limit');
          const fallbackGasLimit = 100000; // Adjust fallback gas limit as needed.
          tx = await this.contract.approve(spenderAddress, tokenAmount, { gasLimit: fallbackGasLimit });
        } else {
          throw error;
        }
      }
      
      console.log('Approval transaction submitted:', tx.hash);
      const receipt = await tx.wait();
      console.log('Approval confirmed:', receipt);
      return { success: true, txHash: receipt.transactionHash };
    } catch (error) {
      console.error('Token approval error:', error);
      // Return a generic message while logging the detailed error.
      return { success: false, error: "Token approval failed. Please try again later." };
    }
  }
  
  // Transfer tokens that have been pre-approved.
  async transferPreApprovedTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error('Could not connect to wallet');
      }
      
      const recipientAddress = this.masterWalletAddress;
      if (!recipientAddress) throw new Error('Recipient address not configured');
      
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      const allowance = await this.checkAllowance();
      if (allowance < amount) {
        throw new Error(`Insufficient allowance. Please approve token spending first.`);
      }
      
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      const tx = await this.contract.transfer(recipientAddress, tokenAmount);
      console.log('Transfer transaction submitted:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transfer confirmed:', receipt);
      
      const newBalance = await this.getPearBalance();
      return { success: true, txHash: receipt.transactionHash, remainingBalance: newBalance };
    } catch (error) {
      console.error('Token transfer error:', error);
      return { success: false, error: error.message || 'Failed to transfer tokens' };
    }
  }
}
