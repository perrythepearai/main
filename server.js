import express from 'express';
import pg from 'pg';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3001;
const host = 'localhost';

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
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true // Changed from false to true for Neon DB
    }
});

// Test database connection
pool.connect()
    .then(client => {
        console.log('✅ Successfully connected to Neon PostgreSQL database');
        client.release();
    })
    .catch(err => {
        console.error('❌ Database connection issue:', err);
        console.error('Connection string format should be: postgresql://username:password@hostname/database?sslmode=require');
    });

// Database initialization
const initDB = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS wallet_users (
            id SERIAL PRIMARY KEY,
            wallet_address VARCHAR(42) UNIQUE NOT NULL,
            auth_token VARCHAR(100),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        );
    `;
    
    try {
        await pool.query(createTableQuery);
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
};

// Generate auth token
const generateAuthToken = () => {
    return 'tk_' + Math.random().toString(36).substr(2) + Date.now();
};

// API Routes
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('💓 Health check requested');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
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