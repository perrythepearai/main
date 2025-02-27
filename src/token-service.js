// token-service.js
import { ethers } from 'ethers';
import { CONFIG } from './quest-config.js';

// Infura endpoint for Polygon Mainnet
const INFURA_URL = "https://polygon-mainnet.infura.io/v3/41df926badb4495cb10f23edc3b0bba6";

// PEAR Token contract address from configuration
const PEAR_TOKEN_ADDRESS = CONFIG.TOKEN.PEAR_TOKEN_ADDRESS;

// Basic ERC20 ABI for balance, transfers, and approvals
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

export class TokenService {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.tokenAddress = PEAR_TOKEN_ADDRESS;
    this.decimals = 18; // Default decimals; will be updated after connection.
    this.masterWalletAddress = CONFIG.TOKEN.MASTER_WALLET_ADDRESS; // Ensure this is set in your config.
    
    // Use the wallet provider from MetaMask for signing transactions.
    if (!window.ethereum) {
      throw new Error("MetaMask not available");
    }
    this.walletProvider = new ethers.providers.Web3Provider(window.ethereum);
    this.signer = this.walletProvider.getSigner();
    this.contract = new ethers.Contract(this.tokenAddress, ERC20_ABI, this.signer);
    
    // Use Infura provider for reliable gas estimation (read-only)
    this.infuraProvider = new ethers.providers.JsonRpcProvider(INFURA_URL);
    this.contractForEstimation = new ethers.Contract(this.tokenAddress, ERC20_ABI, this.infuraProvider);
  }
  
  // Connect to MetaMask and retrieve token decimals.
  async connect() {
    try {
      await this.walletProvider.send("eth_requestAccounts", []);
      try {
        this.decimals = await this.contract.decimals();
        console.log("Token decimals:", this.decimals);
      } catch (error) {
        console.warn("Could not retrieve decimals, using default:", error);
      }
      return true;
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      return false;
    }
  }
  
  // Get the current PEAR token balance of the user.
  async getPearBalance() {
    try {
      const balance = await this.contract.balanceOf(this.walletAddress);
      return Math.floor(parseFloat(ethers.utils.formatUnits(balance, this.decimals)));
    } catch (error) {
      console.error("Error fetching PEAR balance:", error);
      return 0;
    }
  }
  
  // Approve tokens for spending, using Infura for gas estimation.
  async approveTokenSpending(amount = 100000) {
    try {
      if (!this.masterWalletAddress) 
        throw new Error("Master wallet address not configured");
      
      const currentAllowance = await this.contract.allowance(this.walletAddress, this.masterWalletAddress);
      const formattedAllowance = ethers.utils.formatUnits(currentAllowance, this.decimals);
      console.log("Current allowance:", formattedAllowance);
      if (parseFloat(formattedAllowance) >= amount) {
        console.log("Already approved enough tokens:", formattedAllowance);
        return { success: true, txHash: "already-approved" };
      }
      
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Estimate gas using the Infura provider.
      let estimatedGas;
      try {
        estimatedGas = await this.contractForEstimation.estimateGas.approve(this.masterWalletAddress, tokenAmount);
        console.log("Estimated Gas:", estimatedGas.toString());
      } catch (gasError) {
        console.warn("Gas estimation failed for approve, attempting callStatic...", gasError);
        // Run callStatic to simulate the approval.
        try {
          await this.contract.callStatic.approve(this.masterWalletAddress, tokenAmount);
          // If simulation passes, fallback to a default gas limit.
          estimatedGas = ethers.BigNumber.from("100000");
          console.warn("Falling back to default gas limit for approve:", estimatedGas.toString());
        } catch (staticError) {
          console.error("callStatic simulation failed for approve:", staticError);
          throw new Error("Approval simulation failed: " + staticError.message);
        }
      }
      
      // Send the approval transaction using the wallet provider (user signs it).
      const tx = await this.contract.approve(this.masterWalletAddress, tokenAmount, {
        gasLimit: estimatedGas
      });
      console.log("Approval transaction submitted:", tx.hash);
      
      const receipt = await tx.wait();
      console.log("Approval confirmed:", receipt);
      return { success: true, txHash: receipt.transactionHash };
    } catch (error) {
      console.error("Token approval error:", error);
      return { success: false, error: "Token approval failed. " + error.message };
    }
  }
  
  // Deduct tokens by transferring them to the master wallet; uses Infura for gas estimation.
  async deductTokens(amount = 100) {
    try {
      if (!this.masterWalletAddress) 
        throw new Error("Master wallet address not configured");
      
      const balance = await this.contract.balanceOf(this.walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      if (parseFloat(formattedBalance) < amount) {
        throw new Error(`Insufficient balance. You need at least ${amount} PEAR tokens.`);
      }
      
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Estimate gas using the Infura provider.
      let estimatedGas;
      try {
        estimatedGas = await this.contractForEstimation.estimateGas.transfer(this.masterWalletAddress, tokenAmount);
        console.log("Estimated Gas for transfer:", estimatedGas.toString());
      } catch (gasError) {
        console.warn("Gas estimation failed for transfer, attempting callStatic...", gasError);
        // Run callStatic to simulate the transfer.
        try {
          await this.contract.callStatic.transfer(this.masterWalletAddress, tokenAmount);
          // If simulation passes, fallback to a default gas limit.
          estimatedGas = ethers.BigNumber.from("100000");
          console.warn("Falling back to default gas limit for transfer:", estimatedGas.toString());
        } catch (staticError) {
          console.error("callStatic simulation failed for transfer:", staticError);
          throw new Error("Transfer simulation failed: " + staticError.message);
        }
      }
      
      // Send the transaction using the wallet provider (user signs it).
      const tx = await this.contract.transfer(this.masterWalletAddress, tokenAmount, {
        gasLimit: estimatedGas
      });
      console.log("Transaction submitted:", tx.hash);
      
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      const newBalance = await this.getPearBalance();
      return { success: true, txHash: receipt.transactionHash, remainingBalance: newBalance };
    } catch (error) {
      console.error("Token deduction error:", error);
      return { success: false, error: error.message || "Failed to process token deduction" };
    }
  }
}
