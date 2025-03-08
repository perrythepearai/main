import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';
import { saveUser, initDB, testConnection, checkWalletExists, logError } from './db.js';

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
        const result = await saveUser(walletAddress);
        
        // Send response
        res.json({
            success: true,
            auth_token: result.auth_token,
            wallet_address: result.wallet_address
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
        const walletCheck = await checkWalletExists(walletAddress);
        
        if (!walletCheck.found) {
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
testConnection()
    .then(() => initDB())
    .then(() => {
        app.listen(port, host, () => {
            console.log(`✨ API Server running on http://${host}:${port}`);
        });
    })
    .catch(error => {
        logError(error, 'Server startup');
        process.exit(1);
    });