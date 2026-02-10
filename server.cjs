/*Aidtracker Prototype Server*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://gwvepxupoxyyydnisulb.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmVweHVwb3h5eXlkbmlzdWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDE4ODcsImV4cCI6MjA4MDM3Nzg4N30.Ku9SXTAKNMvHilgEpxj5HcVA-0TPt4ziuEq0Irao5Qc';
const supabase = createClient(supabaseUrl, supabaseKey);

// Check if we're in production (Vercel)
const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Admin accounts mapping
const ADMIN_STATIONS = {
    'policeadmin@gmail.com': 'police',
    'fireadmin@gmail.com': 'fire',
    'medicaladmin@gmail.com': 'ambulance'
};

// ------------------ MIDDLEWARE ------------------ //
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Allow all origins for now
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: "100mb" }));

// IMPORTANT: In Vercel, we need to handle static files differently
// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve uploads if directory exists
const uploadsPath = path.join(__dirname, "uploads");
if (fs.existsSync(uploadsPath)) {
    app.use("/uploads", express.static(uploadsPath));
}

// ------------------ FILE PATHS / STORAGE ------------------ //
let reportsData = [];
let notificationsData = [];

// Store active sessions
const activeSessions = new Map();

// ------------------ AUTH MIDDLEWARE ------------------ //
async function verifyAuth(req, res, next) {
    try {
        // Skip auth for login page and root
        if (req.path === '/' || req.path === '/login' || req.path === '/index.html') {
            return next();
        }

        // Check token in multiple locations - IMPORTANT: Check query params first!
        const token = req.query.token || 
                     req.headers.authorization?.split(' ')[1] ||
                     req.body?.token ||
                     req.cookies?.token;

        console.log('🔐 Verifying token for path:', req.path, 'Token exists:', !!token, 'Query token:', req.query.token);

        if (!token) {
            console.log('❌ No token found for protected route:', req.path);
            
            // For HTML pages, redirect to login
            if (!req.path.startsWith('/api/')) {
                return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
            }
            
            // For API endpoints, return JSON error
            return res.status(401).json({ error: 'No token provided' });
        }

        // Check active sessions first
        const sessionData = activeSessions.get(token);
        if (sessionData) {
            req.user = sessionData.user;
            console.log('✅ Token found in active sessions');
            return next();
        }

        // Verify with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('❌ Supabase token verification failed:', error?.message);
            
            // For HTML pages, redirect to login
            if (!req.path.startsWith('/api/')) {
                return res.redirect('/login?session=expired&redirect=' + encodeURIComponent(req.originalUrl));
            }
            
            // For API endpoints
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Check if user is admin
        const station = ADMIN_STATIONS[user.email] || null;
        const userData = {
            id: user.id,
            email: user.email,
            station: station,
            role: station ? 'admin' : 'user',
            token: token
        };

        // Store in active sessions
        activeSessions.set(token, {
            user: userData,
            expiresAt: Date.now() + 3600000 // 1 hour
        });

        console.log(`✅ User authenticated: ${user.email} (${station ? station + ' admin' : 'user'})`);
        req.user = userData;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        
        // For HTML pages, redirect to login
        if (!req.path.startsWith('/api/')) {
            return res.redirect('/login?error=auth_failed&redirect=' + encodeURIComponent(req.originalUrl));
        }
        
        // For API endpoints
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

// Clean up expired sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of activeSessions.entries()) {
        if (session.expiresAt < now) {
            activeSessions.delete(token);
        }
    }
}, 3600000);

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ------------------ STATIC FILE ROUTES (FOR VERCEL) ------------------ //
// Serve HTML files directly
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ------------------ STATION DASHBOARD ROUTES ------------------ //
app.get("/police", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'police') {
        return res.redirect('/login?error=access_denied');
    }
    
    // Pass the token to the HTML file (we'll embed it in a script tag)
    const htmlPath = path.join(__dirname, "police.html");
    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Error reading police.html:', err);
            return res.sendFile(htmlPath);
        }
        
        // Inject token into HTML for client-side use
        const modifiedHtml = html.replace(
            '</head>',
            `<script>
                // Store token from query parameters
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('token');
                if (token) {
                    localStorage.setItem('token', token);
                    // Clean up URL (optional)
                    window.history.replaceState({}, '', '/police');
                }
            </script>
            </head>`
        );
        
        res.send(modifiedHtml);
    });
});

app.get("/fire", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'fire') {
        return res.redirect('/login?error=access_denied');
    }
    res.sendFile(path.join(__dirname, "fire.html"));
});

app.get("/ambulance", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'ambulance') {
        return res.redirect('/login?error=access_denied');
    }
    res.sendFile(path.join(__dirname, "ambulance.html"));
});

// ------------------ AUTH API ROUTES ------------------ //
// Login endpoint
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        console.log(`🔑 Login attempt for: ${email}`);
        
        // Sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Login error:', error);
            return res.status(401).json({ 
                error: error.message || 'Invalid credentials' 
            });
        }

        const { user, session } = data;
        
        // Determine user role and station
        const station = ADMIN_STATIONS[user.email] || null;
        
        // Only allow admin accounts to login
        if (!station) {
            return res.status(403).json({ 
                error: 'Access denied. Admin accounts only.' 
            });
        }
        
        const userData = {
            id: user.id,
            email: user.email,
            station: station,
            role: 'admin',
            token: session.access_token
        };

        // Store session
        activeSessions.set(session.access_token, {
            user: userData,
            expiresAt: Date.now() + 3600000 // 1 hour
        });

        // Set redirect URL with token
        const redirectUrl = `/${station}?token=${session.access_token}`;

        console.log(`✅ Login successful for: ${email}, redirecting to: ${redirectUrl}`);

        res.json({
            success: true,
            token: session.access_token,
            user: userData,
            redirectUrl: redirectUrl
        });

    } catch (error) {
        console.error('Server error during login:', error);
        res.status(500).json({ error: 'Server error during authentication' });
    }
});

// Verify token endpoint
app.post("/api/verify-token", async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ authenticated: false });
    }
    
    try {
        // Check active sessions
        const sessionData = activeSessions.get(token);
        if (sessionData) {
            return res.json({
                authenticated: true,
                user: sessionData.user
            });
        }

        // Verify with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.json({ authenticated: false });
        }

        // Check if user is admin
        const station = ADMIN_STATIONS[user.email] || null;
        
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                email: user.email,
                station: station,
                role: station ? 'admin' : 'user',
                token: token
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.json({ authenticated: false });
    }
});

// Logout endpoint
app.post("/api/logout", async (req, res) => {
    const { token } = req.body;
    
    if (token) {
        activeSessions.delete(token);
        await supabase.auth.signOut();
    }
    
    res.json({ success: true, message: 'Logged out successfully' });
});

// ------------------ REPORT ROUTES ------------------ //
// Initialize data file for Vercel
const REPORTS_FILE = path.join(__dirname, "reports.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "notifications.json");

// Ensure files exist
if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([]));
}

app.get("/api/reports", (req, res) => {
    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
    } catch (parseError) {
        console.error('Error parsing reports.json:', parseError);
        fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
    }
    res.json(data);
});

app.post("/api/reports", (req, res) => {
    let data = [];
    try {
        data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
    } catch (parseError) {
        console.error('Error parsing reports.json in POST:', parseError);
        fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
        data = [];
    }

    const report = req.body;
    report.id = Date.now().toString();
    report.reporter = report.reporter || "Unknown";
    report.createdAt = new Date().toISOString();
    report.status = 'pending';

    // Handle Base64 photo
    if (report.photo) {
        try {
            const matches = report.photo.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!matches || matches.length !== 3) throw new Error("Invalid base64 data");

            const mimeType = matches[1];
            const imageData = matches[2];
            const ext = mimeType.split("/")[1];
            const fileName = `report_${Date.now()}.${ext}`;
            const uploadDir = path.join(__dirname, "uploads");

            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

            report.photo = `/uploads/${fileName}`;
        } catch (err) {
            console.error("⚠️ Failed to save photo:", err);
            report.photo = null;
        }
    }

    data.push(report);
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));

    res.json({
        success: true,
        message: "Report saved successfully",
        report
    });
});

// ------------------ STATION DASHBOARD API ROUTES ------------------ //
app.get("/api/station/:station/reports", verifyAuth, async (req, res) => {
    const { station } = req.params;
    const user = req.user;

    // Verify user has access to this station
    if (user.role === 'admin' && user.station !== station) {
        return res.status(403).json({ error: 'Access denied to this station' });
    }

    try {
        if (!fs.existsSync(REPORTS_FILE)) {
            fs.writeFileSync(REPORTS_FILE, "[]");
        }

        let allReports = [];
        try {
            allReports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
        } catch (parseError) {
            console.error('Error parsing reports.json:', parseError);
            fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
        }

        // Filter reports based on station
        let stationReports = [];
        if (station === 'police') {
            stationReports = allReports;
        } else if (station === 'fire') {
            stationReports = allReports.filter(report => {
                const type = (report.type || '').toString().toLowerCase().trim();
                return type.includes('fire');
            });
        } else if (station === 'ambulance') {
            stationReports = allReports.filter(report => {
                const type = (report.type || '').toString().toLowerCase().trim();
                return type.includes('motor') || type.includes('accident') || type.includes('fire') || type.includes('medical') || type.includes('emergency');
            });
        }

        res.json(stationReports);
    } catch (error) {
        console.error('Error fetching station reports:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update report status
app.put("/api/reports/:id/status", verifyAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        if (!fs.existsSync(REPORTS_FILE)) {
            fs.writeFileSync(REPORTS_FILE, "[]");
        }

        const reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
        const reportIndex = reports.findIndex(r => r.id == id);
        
        if (reportIndex !== -1) {
            reports[reportIndex].status = status;
            reports[reportIndex].updatedAt = new Date().toISOString();
            reports[reportIndex].updatedBy = req.user.email;
            
            fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));

            res.json({ success: true, report: reports[reportIndex] });
        } else {
            res.status(404).json({ error: 'Report not found' });
        }
    } catch (error) {
        console.error('Error updating report status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ------------------ CATCH-ALL ROUTE FOR SPA ------------------ //
// This handles client-side routing for React/Vue/Angular apps
app.get('*', (req, res) => {
    // Don't interfere with API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // Don't interfere with static files that exist
    const staticPath = path.join(__dirname, req.path);
    if (fs.existsSync(staticPath) && !fs.lstatSync(staticPath).isDirectory()) {
        return res.sendFile(staticPath);
    }
    
    // For all other routes, serve the main app (index.html)
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------ EXPORT FOR VERCEL ------------------ //
module.exports = app;