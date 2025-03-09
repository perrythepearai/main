// generate-codes.js - Run this script to generate the initial 100 invite codes

import dotenv from 'dotenv';
import pg from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-key';
const DATABASE_URL = process.env.DATABASE_URL;
const OUTPUT_FILE = 'invite-codes.txt';

// Generate a random invitation code
const generateInviteCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = 'PEAR-';
  
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters.charAt(randomIndex);
  }
  
  return code;
};

// Try to generate codes via API
async function generateCodesViaAPI() {
  try {
    console.log('Attempting to generate codes via API...');
    
    const response = await fetch(`${API_URL}/api/admin/generate-invite-codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY
      },
      timeout: 5000 // 5 second timeout
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('API returned error:', data.error);
      return null;
    }
    
    return data.codes || [];
  } catch (error) {
    console.error('API connection failed:', error.message);
    return null;
  }
}

// Generate codes directly in database
async function generateCodesViaDatabase() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Cannot generate codes directly.');
    return null;
  }
  
  console.log('Attempting to generate codes directly in database...');
  
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Check if table exists, create it if not
    const tableCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_referral'
      );
    `);
    
    if (!tableCheckResult.rows[0].exists) {
      console.log('Creating user_referral table...');
      await pool.query(`
        CREATE TABLE user_referral (
          id SERIAL PRIMARY KEY,
          code VARCHAR(10) UNIQUE NOT NULL,
          creator_wallet_address VARCHAR(42),
          used_by_wallet_address VARCHAR(42),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          used_at TIMESTAMP,
          is_used BOOLEAN DEFAULT false,
          is_initial BOOLEAN DEFAULT false
        );
        
        CREATE INDEX idx_user_referral_code ON user_referral(code);
        CREATE INDEX idx_user_referral_creator ON user_referral(creator_wallet_address);
        CREATE INDEX idx_user_referral_used_by ON user_referral(used_by_wallet_address);
      `);
    }
    
    // Check how many initial codes we already have
    const existingCodesResult = await pool.query(
      'SELECT COUNT(*) FROM user_referral WHERE is_initial = true'
    );
    
    const existingCount = parseInt(existingCodesResult.rows[0].count);
    const codesNeeded = 100;
    const remainingToGenerate = Math.max(0, codesNeeded - existingCount);
    
    console.log(`Found ${existingCount} existing initial codes.`);
    
    if (existingCount >= codesNeeded) {
      console.log('Already have 100 or more initial codes, retrieving them...');
      const existingCodesResult = await pool.query(
        'SELECT code FROM user_referral WHERE is_initial = true'
      );
      return existingCodesResult.rows.map(row => row.code);
    }
    
    console.log(`Generating ${remainingToGenerate} additional initial invite codes`);
    
    const generatedCodes = [];
    
    // Generate and insert the remaining codes
    for (let i = 0; i < remainingToGenerate; i++) {
      let code = generateInviteCode();
      let isDuplicate = true;
      let attempts = 0;
      
      // Keep generating until we get a unique code
      while (isDuplicate && attempts < 10) {
        attempts++;
        const checkResult = await pool.query(
          'SELECT 1 FROM user_referral WHERE code = $1', [code]
        );
        
        if (checkResult.rows.length === 0) {
          isDuplicate = false;
        } else {
          code = generateInviteCode();
        }
      }
      
      if (isDuplicate) {
        console.error(`Failed to generate unique code after ${attempts} attempts. Skipping.`);
        continue;
      }
      
      // Insert the unique code
      await pool.query(
        'INSERT INTO user_referral (code, is_initial) VALUES ($1, true)',
        [code]
      );
      
      generatedCodes.push(code);
    }
    
    // Get all initial codes for return
    const allCodesResult = await pool.query(
      'SELECT code FROM user_referral WHERE is_initial = true'
    );
    
    return allCodesResult.rows.map(row => row.code);
  } catch (error) {
    console.error('Database error:', error);
    return null;
  } finally {
    await pool.end();
  }
}

// Save codes to file
function saveCodesToDisk(codes) {
  if (!codes || codes.length === 0) {
    console.error('No codes to save.');
    return;
  }
  
  try {
    let content = '# PerryPear Invite Codes\n';
    content += '# Generated on ' + new Date().toISOString() + '\n';
    content += '----------------------------------------\n\n';
    
    codes.forEach((code, index) => {
      content += `${(index + 1).toString().padStart(3, '0')}: ${code}\n`;
    });
    
    content += '\n----------------------------------------\n';
    content += `Total codes: ${codes.length}\n`;
    
    fs.writeFileSync(OUTPUT_FILE, content);
    console.log(`Saved ${codes.length} codes to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error saving to file:', error);
  }
}

// Main function
async function main() {
  try {
    console.log('Generating initial 100 invite codes...');
    
    // Try API first
    let codes = await generateCodesViaAPI();
    
    // Fall back to direct database access if API fails
    if (!codes) {
      codes = await generateCodesViaDatabase();
    }
    
    if (!codes || codes.length === 0) {
      console.error('Failed to generate or retrieve invite codes.');
      process.exit(1);
    }
    
    console.log('Successfully generated/retrieved invite codes:');
    console.log('----------------------------------------');
    
    codes.forEach((code, index) => {
      console.log(`${(index + 1).toString().padStart(3, '0')}: ${code}`);
    });
    
    console.log('----------------------------------------');
    console.log(`Total codes: ${codes.length}`);
    
    // Save to file
    saveCodesToDisk(codes);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main();