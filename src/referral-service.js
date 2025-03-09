// referral-service.js

import pg from 'pg';
const { Pool } = pg;

// Get pool configuration from existing db.js or create a new one
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

/**
 * Generate a random invitation code
 * Format: PEAR-XXXX where X is alphanumeric
 */
export const generateInviteCode = () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like O, 0, 1, I
    let code = 'PEAR-';
    
    for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters.charAt(randomIndex);
    }
    
    return code;
};

/**
 * Generate the initial 100 invite codes for admin distribution
 */
export const generateInitialInviteCodes = async () => {
    const initialCodes = [];
    const codesNeeded = 100;
    
    try {
        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Check how many initial codes we already have
            const existingCodesResult = await client.query(
                'SELECT COUNT(*) FROM user_referral WHERE is_initial = true'
            );
            
            const existingCount = parseInt(existingCodesResult.rows[0].count);
            const remainingToGenerate = Math.max(0, codesNeeded - existingCount);
            
            console.log(`Generating ${remainingToGenerate} additional initial invite codes`);
            
            // Generate and insert the remaining codes
            for (let i = 0; i < remainingToGenerate; i++) {
                let code = generateInviteCode();
                let isDuplicate = true;
                
                // Keep generating until we get a unique code
                while (isDuplicate) {
                    const checkResult = await client.query(
                        'SELECT 1 FROM user_referral WHERE code = $1', [code]
                    );
                    
                    if (checkResult.rows.length === 0) {
                        isDuplicate = false;
                    } else {
                        code = generateInviteCode();
                    }
                }
                
                // Insert the unique code
                await client.query(
                    'INSERT INTO user_referral (code, is_initial) VALUES ($1, true) RETURNING code',
                    [code]
                );
                
                initialCodes.push(code);
            }
            
            await client.query('COMMIT');
            console.log(`Successfully generated ${initialCodes.length} initial invite codes`);
            
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error generating initial invite codes:', err);
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Database connection error:', err);
        throw err;
    }
    
    return initialCodes;
};

/**
 * Generate 3 invite codes for a user who has registered
 */
export const generateUserInviteCodes = async (walletAddress) => {
    const userCodes = [];
    
    try {
        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Generate 3 codes for the user
            for (let i = 0; i < 3; i++) {
                let code = generateInviteCode();
                let isDuplicate = true;
                
                // Keep generating until we get a unique code
                while (isDuplicate) {
                    const checkResult = await client.query(
                        'SELECT 1 FROM user_referral WHERE code = $1', [code]
                    );
                    
                    if (checkResult.rows.length === 0) {
                        isDuplicate = false;
                    } else {
                        code = generateInviteCode();
                    }
                }
                
                // Insert the unique code
                await client.query(
                    'INSERT INTO user_referral (code, creator_wallet_address) VALUES ($1, $2) RETURNING code',
                    [code, walletAddress]
                );
                
                userCodes.push(code);
            }
            
            await client.query('COMMIT');
            console.log(`Successfully generated 3 invite codes for user: ${walletAddress}`);
            
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error generating user invite codes:', err);
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Database connection error:', err);
        throw err;
    }
    
    return userCodes;
};

/**
 * Verify an invite code and mark it as used if valid
 */
export const verifyAndUseInviteCode = async (code, walletAddress) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Check if the code exists and is not used
            const checkResult = await client.query(
                'SELECT id FROM user_referral WHERE code = $1 AND is_used = false',
                [code]
            );
            
            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { 
                    valid: false, 
                    message: 'Invalid or already used invite code' 
                };
            }
            
            // Mark the code as used
            await client.query(
                'UPDATE user_referral SET is_used = true, used_by_wallet_address = $1, used_at = NOW() WHERE code = $2',
                [walletAddress, code]
            );
            
            await client.query('COMMIT');
            return { 
                valid: true, 
                message: 'Invite code accepted' 
            };
            
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error verifying invite code:', err);
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Database connection error:', err);
        throw err;
    }
};

/**
 * Check if a user has already used an invite code
 */
export const hasUsedInviteCode = async (walletAddress) => {
    try {
        const result = await pool.query(
            'SELECT 1 FROM user_referral WHERE used_by_wallet_address = $1 LIMIT 1',
            [walletAddress]
        );
        
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking if user has used invite code:', err);
        throw err;
    }
};

/**
 * Get a user's invite codes
 */
export const getUserInviteCodes = async (walletAddress) => {
    try {
        const result = await pool.query(
            'SELECT code, is_used, used_by_wallet_address FROM user_referral WHERE creator_wallet_address = $1',
            [walletAddress]
        );
        
        return result.rows;
    } catch (err) {
        console.error('Error getting user invite codes:', err);
        throw err;
    }
};