import express from 'express';
import pg from 'pg';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3001;
const host = process.env.HOST || 'localhost';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`🌐 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Detailed error logging
const logError = (error, context) => {
    console.error('==== Error Details ====');
    console.error('Context:', context);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (error.detail) console.error('DB Detail:', error.detail);
    console.error('=====================');
};


// Configure PostgreSQL pool with environment variables
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || '',
    ssl: {
        rejectUnauthorized: true
    }
});

// Test database connection
pool.connect()
    .then(client => {
        console.log('✅ Successfully connected to PostgreSQL database');
        client.release();
    })
    .catch(err => {
        console.error('❌ Database connection issue:', err);
        console.error('Connection string format should be: postgresql://username:password@hostname/database?sslmode=require');
    });

// Database initialization
const initDB = async () => {
    const createTablesQueries = [
        // Original wallet_users table
        `
        CREATE TABLE IF NOT EXISTS wallet_users (
            id SERIAL PRIMARY KEY,
            wallet_address VARCHAR(42) UNIQUE NOT NULL,
            auth_token VARCHAR(100),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        );
        `,
        // New user_referral table
        `
        CREATE TABLE IF NOT EXISTS user_referral (
            id SERIAL PRIMARY KEY,
            code VARCHAR(10) UNIQUE NOT NULL,
            creator_wallet_address VARCHAR(42),
            used_by_wallet_address VARCHAR(42),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            used_at TIMESTAMP,
            is_used BOOLEAN DEFAULT false,
            is_initial BOOLEAN DEFAULT false
        );
        `,
        // Indices for user_referral table
        `
        CREATE INDEX IF NOT EXISTS idx_user_referral_code ON user_referral(code);
        `,
        `
        CREATE INDEX IF NOT EXISTS idx_user_referral_creator ON user_referral(creator_wallet_address);
        `,
        `
        CREATE INDEX IF NOT EXISTS idx_user_referral_used_by ON user_referral(used_by_wallet_address);
        `
    ];
    
    try {
        for (const query of createTablesQueries) {
            await pool.query(query);
        }
        console.log('✅ Database tables initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
};

// Generate auth token
const generateAuthToken = () => {
    return 'tk_' + Math.random().toString(36).substr(2) + Date.now();
};

// ===== REFERRAL SYSTEM FUNCTIONS =====

/**
 * Generate a random invitation code
 * Format: PEAR-XXXX where X is alphanumeric
 */
const generateInviteCode = () => {
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
const generateInitialInviteCodes = async () => {
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
                const result = await client.query(
                    'INSERT INTO user_referral (code, is_initial) VALUES ($1, true) RETURNING code',
                    [code]
                );
                
                initialCodes.push(result.rows[0].code);
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
const generateUserInviteCodes = async (walletAddress) => {
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
                const result = await client.query(
                    'INSERT INTO user_referral (code, creator_wallet_address) VALUES ($1, $2) RETURNING code',
                    [code, walletAddress]
                );
                
                userCodes.push(result.rows[0].code);
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
const verifyAndUseInviteCode = async (code, walletAddress) => {
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
const hasUsedInviteCode = async (walletAddress) => {
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
const getUserInviteCodes = async (walletAddress) => {
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

// ===== API ROUTES =====

// User login endpoint
app.post('/api/users/login', async (req, res) => {
    console.log('🔐 Login request received:', req.body);
    
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
        console.warn('⚠️ Missing wallet address');
        return res.status(400).json({ 
            success: false, 
            error: 'Wallet address is required' 
        });
    }

    try {
        // First check if user exists
        let checkQuery = 'SELECT * FROM wallet_users WHERE wallet_address = $1';
        let checkResult = await pool.query(checkQuery, [walletAddress]);
        console.log('🔍 Check existing user result:', checkResult.rows);

        const authToken = generateAuthToken();
        console.log('🎫 Generated auth token:', authToken);

        let result;
        if (checkResult.rows.length === 0) {
            // New user - Insert
            console.log('👤 Creating new user record');
            const insertQuery = `
                INSERT INTO wallet_users 
                (wallet_address, auth_token, created_at, last_login, is_active)
                VALUES ($1, $2, NOW(), NOW(), true)
                RETURNING *;
            `;
            result = await pool.query(insertQuery, [walletAddress, authToken]);
            console.log('✅ New user created:', result.rows[0]);
        } else {
            // Existing user - Update
            console.log('👤 Updating existing user');
            const updateQuery = `
                UPDATE wallet_users 
                SET auth_token = $2,
                    last_login = NOW(),
                    is_active = true
                WHERE wallet_address = $1
                RETURNING *;
            `;
            result = await pool.query(updateQuery, [walletAddress, authToken]);
            console.log('✅ User updated:', result.rows[0]);
        }

        // Send response
        res.json({
            success: true,
            auth_token: result.rows[0].auth_token,
            wallet_address: result.rows[0].wallet_address,
            is_new_user: checkResult.rows.length === 0
        });

    } catch (error) {
        console.error('❌ Database error:', {
            message: error.message,
            stack: error.stack,
            detail: error.detail
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Database error',
            message: error.message
        });
    }
});

// Generate the initial 100 invite codes (Admin endpoint)
app.post('/api/admin/generate-invite-codes', async (req, res) => {
    try {
        // This should be secured with admin authentication in production
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_API_KEY) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const codes = await generateInitialInviteCodes();
        return res.json({ success: true, codes });
    } catch (error) {
        console.error('Error generating initial invite codes:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Verify an invite code
app.post('/api/referral/verify', async (req, res) => {
    try {
        const { code, walletAddress } = req.body;
        
        if (!code || !walletAddress) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        
        const result = await verifyAndUseInviteCode(code, walletAddress);
        
        if (result.valid) {
            // If valid, generate 3 new invite codes for this user
            const userCodes = await generateUserInviteCodes(walletAddress);
            
            return res.json({ 
                success: true, 
                message: result.message,
                inviteCodes: userCodes
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                error: result.message 
            });
        }
    } catch (error) {
        console.error('Error verifying invite code:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Check if user has already verified
app.get('/api/referral/status/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        
        if (!walletAddress) {
            return res.status(400).json({ success: false, error: 'Wallet address is required' });
        }
        
        const hasUsed = await hasUsedInviteCode(walletAddress);
        
        return res.json({ 
            success: true, 
            hasUsedInviteCode: hasUsed 
        });
    } catch (error) {
        console.error('Error checking referral status:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Get user's invite codes
app.get('/api/referral/codes/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        
        if (!walletAddress) {
            return res.status(400).json({ success: false, error: 'Wallet address is required' });
        }
        
        const codes = await getUserInviteCodes(walletAddress);
        
        return res.json({ 
            success: true, 
            codes 
        });
    } catch (error) {
        console.error('Error getting user invite codes:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('💓 Health check requested');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Placeholder image endpoint
app.get('/api/placeholder/:width/:height', (req, res) => {
    const { width, height } = req.params;
    console.log('🖼️ Placeholder image requested:', { width, height });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#4CAF50"/>
            <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dy=".3em">🍐</text>
        </svg>
    `);
});

// Handle favicon.ico request
app.get('/favicon.ico', (req, res) => {
    console.log('🎯 Favicon requested');
    res.sendFile(path.join(__dirname, 'dist', 'favicon.ico'), err => {
        if (err) {
            console.log('ℹ️ No favicon found, sending 204');
            res.status(204).end();
        }
    });
});

// Redirect base coming-soon.html to home
app.get('/coming-soon.html', (req, res) => {
    console.log('🌟 Base coming-soon page requested - redirecting to home');
    res.redirect('/');
});

// Handle personalized coming-soon page
app.get('/coming-soon.html/:walletAddress', async (req, res) => {
    console.log('🌟 Personalized coming soon page requested:', {
        params: req.params,
        url: req.url,
        path: req.path
    });
    
    const { walletAddress } = req.params;
    
    try {
        // Check if wallet exists and is active in database
        console.log('🔍 Verifying wallet in database:', walletAddress);
        const query = `
            SELECT * FROM wallet_users 
            WHERE wallet_address = $1 
            AND is_active = true
        `;
        
        const result = await pool.query(query, [walletAddress]);
        console.log('📊 Wallet verification result:', {
            found: result.rows.length > 0,
            wallet: result.rows[0]
        });
        
        if (result.rows.length === 0) {
            console.log('⚠️ Wallet not found or inactive, redirecting to home');
            return res.redirect('/');
        }

        // If wallet is verified, serve the coming-soon page
        console.log('✅ Wallet verified, serving coming-soon page');
        res.sendFile(path.join(__dirname, 'dist', 'coming-soon.html'), err => {
            if (err) {
                console.error('❌ Error sending coming-soon.html:', err);
                res.status(500).send('Error loading page');
            } else {
                console.log('📄 Coming-soon page sent successfully');
            }
        });
    } catch (error) {
        console.error('❌ Database error:', error);
        logError(error, 'Personalized coming-soon page access');
        res.status(500).send('Error verifying wallet');
    }
});

// Handle other HTML files
app.get('*.html', (req, res) => {
    console.log('📑 HTML file requested:', req.path);
    const htmlFile = path.join(__dirname, 'dist', path.basename(req.path));
    res.sendFile(htmlFile, err => {
        if (err) {
            console.error('❌ Error sending HTML file:', err);
            res.status(500).send('Error loading page');
        }
    });
});

// Static file error handling
app.use((err, req, res, next) => {
    if (err.code === 'ENOENT') {
        console.error('🔍 File not found:', err.path);
        return res.status(404).send('File not found');
    }
    next(err);
});

// Catch-all route for the SPA
app.get('*', (req, res) => {
    console.log('🔄 Catch-all route hit for:', req.path);
    res.sendFile(path.join(__dirname, 'dist', 'index.html'), err => {
        if (err) {
            console.error('❌ Error sending index.html:', err);
            res.status(500).send('Error loading page');
        }
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logError(err, 'Global error handler');
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Initialize database and start server
initDB()
    .then(() => {
        app.listen(port, host, () => {
            console.log(`✨ API Server running on http://${host}:${port}`);
        });
    })
    .catch(error => {
        logError(error, 'Server startup');
        process.exit(1);
    });