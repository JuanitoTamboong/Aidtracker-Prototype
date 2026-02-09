import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import http from "http";
import { createClient } from '@supabase/supabase-js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return callback(null, true);

            // Allow localhost for development
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);

            // Allow all origins for production (you may want to restrict this)
            return callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://gwvepxupoxyyydnisulb.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmVweHVwb3h5eXlkbmlzdWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDE4ODcsImV4cCI6MjA4MDM3Nzg4N30.Ku9SXTAKNMvHilgEpxj5HcVA-0TPt4ziuEq0Irao5Qc';
const supabase = createClient(supabaseUrl, supabaseKey);

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

        // Allow localhost for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);

        // Allow all origins for production (you may want to restrict this)
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: "100mb" }));

// Static files
app.use(express.static(__dirname));

// Static files for uploads
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

// Store active sessions
const activeSessions = new Map();

// ------------------ AUTH MIDDLEWARE ------------------ //
async function verifyAuth(req, res, next) {
    try {
        const token = req.query.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Check active sessions first
        const sessionData = activeSessions.get(token);
        if (sessionData) {
            req.user = sessionData.user;
            return next();
        }

        // Verify with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
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

        req.user = userData;
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

// ------------------ PAGE ROUTES ------------------ //
app.get("/", (req, res) => {
    res.redirect("/login");
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Station dashboard routes
app.get("/police", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'police') {
        return res.status(403).send('Access denied');
    }
    res.sendFile(path.join(__dirname, "police.html"));
});

app.get("/fire", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'fire') {
        return res.status(403).send('Access denied');
    }
    res.sendFile(path.join(__dirname, "fire.html"));
});

app.get("/ambulance", verifyAuth, (req, res) => {
    if (req.user.role !== 'admin' || req.user.station !== 'ambulance') {
        return res.status(403).send('Access denied');
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
        const userData = {
            id: user.id,
            email: user.email,
            station: station,
            role: station ? 'admin' : 'user',
            token: session.access_token
        };

        // Store session
        activeSessions.set(session.access_token, {
            user: userData,
            expiresAt: Date.now() + 3600000 // 1 hour
        });

        // Set redirect URL
        let redirectUrl = '/dashboard';
        if (station) {
            redirectUrl = `/${station}`;
        } else {
            // Regular users - show error or redirect to login
            return res.status(403).json({ 
                error: 'Access denied. Admin accounts only.' 
            });
        }

        res.json({
            success: true,
            token: session.access_token,
            refresh_token: session.refresh_token,
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
    const targetEmails = Object.keys(ADMIN_STATIONS)
        .filter(email => targetStations.includes(ADMIN_STATIONS[email]));

    // Save notifications
    const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    
    for (const email of targetEmails) {
        const notification = {
            id: Date.now() + Math.random(),
            title: `New ${incidentType.replace('_', ' ').toUpperCase()} Report`,
            message: `${report.reporter} reported a ${incidentType.replace('_', ' ')} at ${report.location || 'Unknown location'}`,
            user: email,
            station: ADMIN_STATIONS[email],
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
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Login page: http://localhost:${PORT}/login`);
    console.log(`\n🔐 Admin Accounts (use email/password from Supabase):`);
    console.log(`   👮 Police: policeadmin@gmail.com`);
    console.log(`   🚒 Fire: fireadmin@gmail.com`);
    console.log(`   🚑 Ambulance: medicaladmin@gmail.com`);
    console.log(`\n🌐 Server is ready for deployment!`);
});
