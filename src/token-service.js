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

// Replace this with your Infura URL
const INFURA_URL = "https://polygon-mainnet.infura.io/v3/41df926badb4495cb10f23edc3b0bba6";

export class TokenService {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.tokenAddress = PEAR_TOKEN_ADDRESS;
    this.decimals = 18; // Default ERC20 decimals; will update after connecting.
    // Create a provider using Infura
    this.provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
    
    // IMPORTANT: To auto-sign transactions using Infura,
    // you must supply a private key. NEVER expose a private key in production client‑side code.
    if (!CONFIG.PRIVATE_KEY) {
      throw new Error("No private key provided in configuration");
    }
    this.signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider);
    
    // Create the contract instance connected with the signer
    this.contract = new ethers.Contract(this.tokenAddress, ERC20_ABI, this.signer);
    this.masterWalletAddress = CONFIG.MASTER_WALLET_ADDRESS;
  }

  // In this Infura-based setup, connect simply verifies the connection.
  async connect() {
    try {
      const network = await this.provider.getNetwork();
      console.log("Connected to network:", network);
      try {
        this.decimals = await this.contract.decimals();
        console.log("Token decimals:", this.decimals);
      } catch (error) {
        console.warn("Could not retrieve decimals, using default:", error);
      }
      return true;
    } catch (error) {
      console.error("Error connecting to Infura:", error);
      return false;
    }
  }

  async getPearBalance() {
    try {
      // Ensure connection is established.
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      const balance = await this.contract.balanceOf(this.walletAddress);
      return Math.floor(parseFloat(ethers.utils.formatUnits(balance, this.decimals)));
    } catch (error) {
      console.error("Error fetching PEAR balance:", error);
      return 0;
    }
  }
  
  async deductTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error("Could not connect to network");
      }
      
      if (!this.masterWalletAddress) throw new Error("Master wallet address not configured");
      
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      const tx = await this.contract.transfer(this.masterWalletAddress, tokenAmount);
      console.log("Transaction submitted:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      const newBalance = await this.getPearBalance();
      return {
        success: true,
        txHash: receipt.transactionHash,
        remainingBalance: newBalance
      };
    } catch (error) {
      console.error("Token deduction error:", error);
      return {
        success: false,
        error: error.message || "Failed to process token deduction"
      };
    }
  }

  async checkAllowance() {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) return 0;
      }
      if (!this.masterWalletAddress) throw new Error("Master wallet address not configured");
      const allowance = await this.contract.allowance(this.walletAddress, this.masterWalletAddress);
      const formattedAllowance = ethers.utils.formatUnits(allowance, this.decimals);
      console.log("Current allowance:", formattedAllowance);
      return parseFloat(formattedAllowance);
    } catch (error) {
      console.error("Error checking allowance:", error);
      return 0;
    }
  }

  async approveTokenSpending(amount = 100000) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error("Could not connect to network");
      }
      
      const spenderAddress = this.masterWalletAddress;
      if (!spenderAddress) throw new Error("Master wallet address not configured");
      
      const currentAllowance = await this.checkAllowance();
      if (currentAllowance >= amount) {
        console.log("Already approved enough tokens:", currentAllowance);
        return {
          success: true,
          txHash: "already-approved"
        };
      }
      
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      let tx;
      try {
        tx = await this.contract.approve(spenderAddress, tokenAmount);
      } catch (error) {
        // If gas estimation fails, you can catch it here.
        // In this setup, we are not using a manual gas limit.
        throw error;
      }
      
      console.log("Approval transaction submitted:", tx.hash);
      const receipt = await tx.wait();
      console.log("Approval confirmed:", receipt);
      return {
        success: true,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      console.error("Token approval error:", error);
      return {
        success: false,
        error: "Token approval failed. Please try again later."
      };
    }
  }

  async transferPreApprovedTokens(amount = 100) {
    try {
      if (!this.contract) {
        const connected = await this.connect();
        if (!connected) throw new Error("Could not connect to network");
      }
      
      const recipientAddress = this.masterWalletAddress;
      if (!recipientAddress) throw new Error("Recipient address not configured");
      
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
      console.log("Transfer transaction submitted:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transfer confirmed:", receipt);
      const newBalance = await this.getPearBalance();
      return {
        success: true,
        txHash: receipt.transactionHash,
        remainingBalance: newBalance
      };
    } catch (error) {
      console.error("Token transfer error:", error);
      return {
        success: false,
        error: error.message || "Failed to transfer tokens"
      };
    }
  }
}
