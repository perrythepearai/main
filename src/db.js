// src/db.js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: {
        rejectUnauthorized: false
    }
});


// Error logging helper
const logError = (error, context) => {
    console.error('==== Database Error ====');
    console.error('Context:', context);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (error.detail) console.error('Detail:', error.detail);
    console.error('=====================');
};

export const saveUser = async (walletAddress) => {
    const authToken = generateAuthToken();
    const query = `
        INSERT INTO wallet_users (wallet_address, auth_token, created_at, last_login, is_active)
        VALUES ($1, $2, NOW(), NOW(), true)
        ON CONFLICT (wallet_address) 
        DO UPDATE SET 
            last_login = NOW(), 
            auth_token = $2, 
            is_active = true
        RETURNING id, auth_token, wallet_address`;
    
    try {
        const result = await pool.query(query, [walletAddress, authToken]);
        return {
            success: true,
            ...result.rows[0]
        };
    } catch (error) {
        logError(error, 'saveUser');
        throw error;
    }
};

export const verifyWalletAuth = async (walletAddress, authToken) => {
    const query = `
        SELECT * FROM wallet_users 
        WHERE wallet_address = $1 
        AND auth_token = $2 
        AND is_active = true`;
    
    try {
        const result = await pool.query(query, [walletAddress, authToken]);
        return result.rows.length > 0;
    } catch (error) {
        logError(error, 'verifyWalletAuth');
        throw error;
    }
};

const generateAuthToken = () => {
    return 'tk_' + Math.random().toString(36).substr(2) + Date.now();
};

// Initialize the database
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
        console.log('Database initialized successfully');
    } catch (error) {
        logError(error, 'initDB');
        throw error;
    }
};

// Test database connection and initialize
pool.connect((err, client, release) => {
    if (err) {
        logError(err, 'Initial database connection test');
        return;
    }
    console.log('Database connected successfully');
    release();
    
    // Initialize database after successful connection
    initDB().catch(error => {
        logError(error, 'Database initialization');
        process.exit(1);
    });
});