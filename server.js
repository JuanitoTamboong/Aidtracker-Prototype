import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import http from "http";
import { createClient } from '@supabase/supabase-js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://127.0.0.1:5500", "http://127.0.0.1:5501"],
        methods: ["GET", "POST"],
        credentials: true
    }
});
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase
const supabaseUrl = 'https://gwvepxupoxyyydnisulb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmVweHVwb3h5eXlkbmlzdWxiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMTg4NywiZXhwIjoyMDgwMzc3ODg3fQ.0Q1yTrQfwRl0c7zTas_61frYKpQ9bThsGpgoJRNu7p8';
const supabase = createClient(supabaseUrl, supabaseKey);

// ------------------ MIDDLEWARE ------------------ //
app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:5500", "http://127.0.0.1:5501"],
    credentials: true
}));
app.use(express.json({ limit: "100mb" }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------ FILE PATHS ------------------ //
const REPORTS_FILE = path.join(__dirname, "reports.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "notifications.json");

// Initialize files
if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([]));
}

// Admin accounts mapping
const ADMIN_ACCOUNTS = {
    'policeadmin@gmail.com': { station: 'police', username: 'police_admin' },
    'fireadmin@gmail.com': { station: 'fire', username: 'fire_admin' },
    'medicaladmin@gmail.com': { station: 'ambulance', username: 'medical_admin' }
};

// Admin passwords for demo
const ADMIN_PASSWORDS = {
    'policeadmin@gmail.com': 'Police1234!',
    'fireadmin@gmail.com': 'Fire1234!',
    'medicaladmin@gmail.com': 'Medical1234!'
};

// Demo regular users (since Supabase email login is disabled)
const DEMO_USERS = {
    'user@example.com': { password: 'User1234!', role: 'user' }
};

// Demo user tokens storage
const userTokens = new Map();

// Demo tokens storage (in production, use proper auth)
const demoTokens = new Map();

// ------------------ AUTH MIDDLEWARE ------------------ //
async function verifyAuth(req, res, next) {
    try {
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        // Check if it's a demo token (admin account)
        if (token.startsWith('demo-token-')) {
            // Get user from demo tokens storage
            const userData = demoTokens.get(token);
            if (!userData) {
                // Fallback to localStorage data (sent via headers)
                const storedData = req.headers['x-user-data'];
                if (storedData) {
                    try {
                        const user = JSON.parse(storedData);
                        req.user = user;
                        return next();
                    } catch (e) {
                        return res.status(401).json({ error: 'Invalid demo token' });
                    }
                }
                return res.status(401).json({ error: 'Invalid demo token' });
            }
            
            req.user = userData;
            return next();
        }
        
        // Regular Supabase token validation
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Check if user is admin
        const adminAccount = ADMIN_ACCOUNTS[user.email];
        if (adminAccount) {
            req.user = {
                email: user.email,
                station: adminAccount.station,
                role: 'admin',
                token: token
            };
        } else {
            req.user = {
                email: user.email,
                station: null,
                role: 'user',
                token: token
            };
        }
        
        next();
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

// ------------------ SOCKET.IO CONNECTIONS ------------------ //
const connectedClients = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('registerUser', (userData) => {
        connectedClients.set(socket.id, { ...userData, socket });
        console.log(`User ${userData.email} registered for notifications`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });
});

// ------------------ PAGE ROUTES ------------------ //
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});


// Station dashboard routes
app.get("/police", (req, res) => {
    res.sendFile(path.join(__dirname, "police.html"));
});

app.get("/fire", (req, res) => {
    res.sendFile(path.join(__dirname, "fire.html"));
});

app.get("/ambulance", (req, res) => {
    res.sendFile(path.join(__dirname, "ambulance.html"));
});

// Regular user dashboard
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ------------------ AUTH API ROUTES ------------------ //
// Demo login endpoint for admin accounts
app.post("/api/admin-login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if admin account
    if (!ADMIN_ACCOUNTS[email]) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // Check password
    if (password !== ADMIN_PASSWORDS[email]) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate demo token
    const demoToken = `demo-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userData = {
        email: email,
        station: ADMIN_ACCOUNTS[email].station,
        role: 'admin',
        token: demoToken,
        isAdmin: true
    };

    // Store demo token
    demoTokens.set(demoToken, userData);

    // Clean up old tokens after 1 hour
    setTimeout(() => {
        demoTokens.delete(demoToken);
    }, 3600000);

    res.json({
        success: true,
        token: demoToken,
        user: userData
    });
});

// Demo login endpoint for regular users
app.post("/api/user-login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if demo user account
    if (!DEMO_USERS[email]) {
        return res.status(401).json({ error: 'Invalid user credentials' });
    }

    // Check password
    if (password !== DEMO_USERS[email].password) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate user token
    const userToken = `user-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userData = {
        email: email,
        station: null,
        role: DEMO_USERS[email].role,
        token: userToken,
        isAdmin: false
    };

    // Store user token
    userTokens.set(userToken, userData);

    // Clean up old tokens after 1 hour
    setTimeout(() => {
        userTokens.delete(userToken);
    }, 3600000);

    res.json({
        success: true,
        token: userToken,
        user: userData
    });
});

// Verify token endpoint
app.post("/api/verify-token", async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ authenticated: false });
    }
    
    try {
        // Check if demo token
        if (token.startsWith('demo-token-')) {
            const userData = demoTokens.get(token);
            if (userData) {
                return res.json({
                    authenticated: true,
                    user: userData
                });
            }
        }
        
        // Check Supabase token
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.json({ authenticated: false });
        }
        
        // Check if user is admin
        const adminAccount = ADMIN_ACCOUNTS[user.email];
        const station = adminAccount ? adminAccount.station : null;
        
        res.json({
            authenticated: true,
            user: {
                email: user.email,
                station: station,
                role: adminAccount ? 'admin' : 'user',
                token: token
            }
        });
    } catch (error) {
        res.json({ authenticated: false });
    }
});

// ------------------ REPORT ROUTES ------------------ //
app.get("/api/reports", (req, res) => {
    if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
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
    if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
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

    io.emit("newReport", report);

    // Send notifications
    const stationMapping = {
        'motor_accident': ['police', 'ambulance'],
        'fire_accident': ['fire', 'ambulance'],
        'assault_crime': ['police'],
        'medical_emergency': ['ambulance']
    };

    let incidentType = 'motor_accident';
    const dbType = (report.type || '').toString().toLowerCase().trim();

    if (dbType.includes('fire')) incidentType = 'fire_accident';
    else if (dbType.includes('assault') || dbType.includes('crime')) incidentType = 'assault_crime';
    else if (dbType.includes('medical') || dbType.includes('emergency')) incidentType = 'medical_emergency';

    const targetStations = stationMapping[incidentType] || [];
    const targetEmails = Object.keys(ADMIN_ACCOUNTS)
        .filter(email => targetStations.includes(ADMIN_ACCOUNTS[email].station));

    // Save notifications
    const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    
    for (const email of targetEmails) {
        const notification = {
            id: Date.now() + Math.random(),
            title: `New ${incidentType.replace('_', ' ').toUpperCase()} Report`,
            message: `${report.reporter} reported a ${incidentType.replace('_', ' ')} at ${report.location || 'Unknown location'}`,
            user: email,
            station: ADMIN_ACCOUNTS[email].station,
            incidentType: incidentType,
            reportId: report.id,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: new Date().toLocaleDateString(),
            read: false,
            createdAt: new Date().toISOString()
        };

        notifications.push(notification);

        // Send real-time notification
        for (let [socketId, client] of connectedClients.entries()) {
            if (client.email === email) {
                client.socket.emit('newNotification', notification);
                break;
            }
        }
    }

    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));

    res.json({
        success: true,
        message: "Report saved successfully",
        report,
        routedTo: targetStations
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
            // Reset to empty array if corrupted
            fs.writeFileSync(REPORTS_FILE, JSON.stringify([]));
        }

        // Filter reports based on station
        let stationReports = [];
        if (station === 'police') {
            // Police station sees all reports for comprehensive emergency response
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

// Get notifications for a specific station/admin
app.get("/api/station/:station/notifications", verifyAuth, async (req, res) => {
    const { station } = req.params;
    const user = req.user;

    // Verify user has access to this station
    if (user.role === 'admin' && user.station !== station) {
        return res.status(403).json({ error: 'Access denied to this station' });
    }

    try {
        if (!fs.existsSync(NOTIFICATIONS_FILE)) {
            fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
        }

        const allNotifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
        
        // Filter notifications for this station/user
        const stationNotifications = allNotifications.filter(notification => 
            notification.user === user.email
        );

        res.json(stationNotifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark notification as read
app.put("/api/notifications/:id/read", verifyAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        if (!fs.existsSync(NOTIFICATIONS_FILE)) {
            fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
        }

        const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
        const notificationIndex = notifications.findIndex(n => n.id == id);
        
        if (notificationIndex !== -1) {
            notifications[notificationIndex].read = true;
            fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
            res.json({ success: true, message: 'Notification marked as read' });
        } else {
            res.status(404).json({ error: 'Notification not found' });
        }
    } catch (error) {
        console.error('Error updating notification:', error);
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
            
            // Emit status update via socket
            io.emit('reportStatusUpdate', {
                id: id,
                status: status,
                updatedBy: req.user.email
            });
            
            res.json({ success: true, report: reports[reportIndex] });
        } else {
            res.status(404).json({ error: 'Report not found' });
        }
    } catch (error) {
        console.error('Error updating report status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ------------------ START SERVER ------------------ //
server.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`✅ Login page: http://localhost:${PORT}/login`);
    console.log(`\n📋 Admin Accounts:`);
    console.log(`   👮 Police: policeadmin@gmail.com / Police1234!`);
    console.log(`   🚒 Fire: fireadmin@gmail.com / Fire1234!`);
    console.log(`   🚑 Ambulance: medicaladmin@gmail.com / Medical1234!`);
});