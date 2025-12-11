import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import http from "http";
import bcrypt from "bcryptjs";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------ MIDDLEWARE ------------------ //
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------ FILE PATHS ------------------ //
const REPORTS_FILE = path.join(__dirname, "reports.json");
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "notifications.json");

// Initialize notifications file
if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([]));
}

// ------------------ SOCKET.IO CONNECTIONS ------------------ //
const connectedClients = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('registerUser', (username) => {
        connectedClients.set(socket.id, { username, socket });
        console.log(`User ${username} registered for notifications`);
    });
    
    socket.on('markAsRead', (data) => {
        const { notificationId, username } = data;
        
        // Read current notifications
        let notifications = [];
        if (fs.existsSync(NOTIFICATIONS_FILE)) {
            notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
        }
        
        // Mark notification as read
        notifications = notifications.map(notif => {
            if (notif.id === notificationId && notif.user === username) {
                return { ...notif, read: true, readAt: new Date().toISOString() };
            }
            return notif;
        });
        
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
        
        // Send updated notifications to user
        const userNotifications = notifications.filter(n => n.user === username);
        socket.emit('notificationsUpdate', userNotifications);
    });
    
    socket.on('deleteNotification', (data) => {
        const { notificationId, username } = data;
        
        let notifications = [];
        if (fs.existsSync(NOTIFICATIONS_FILE)) {
            notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
        }
        
        // Remove notification
        notifications = notifications.filter(notif => 
            !(notif.id === notificationId && notif.user === username)
        );
        
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
        
        // Send updated notifications to user
        const userNotifications = notifications.filter(n => n.user === username);
        socket.emit('notificationsUpdate', userNotifications);
    });
    
    socket.on('markAllAsRead', (data) => {
        const { username } = data;
        
        let notifications = [];
        if (fs.existsSync(NOTIFICATIONS_FILE)) {
            notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
        }
        
        // Mark all user notifications as read
        notifications = notifications.map(notif => {
            if (notif.user === username && !notif.read) {
                return { ...notif, read: true, readAt: new Date().toISOString() };
            }
            return notif;
        });
        
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
        
        // Send updated notifications to user
        const userNotifications = notifications.filter(n => n.user === username);
        socket.emit('notificationsUpdate', userNotifications);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });
});

// ------------------ PAGE ROUTES ------------------ //
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "home.html")));
app.get("/map", (req, res) => res.sendFile(path.join(__dirname, "map.html")));
app.get("/notif", (req, res) => res.sendFile(path.join(__dirname, "notif.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "register.html")));

// ------------------ AUTH ROUTES ------------------ //
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]");
    const users = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));

    if (users.find((user) => user.username === username)) {
        return res.json({ success: false, message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(users, null, 2));

    res.json({ success: true });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]");
    const users = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    const user = users.find((user) => user.username === username);

    if (!user) return res.json({ success: false });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false });

    res.json({ success: true });
});

// ------------------ REPORT ROUTES ------------------ //
app.get("/api/reports", (req, res) => {
    if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
    const data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
    res.json(data);
});

app.post("/api/reports", (req, res) => {
    if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
    const data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));

    const report = req.body;
    report.reporter = report.reporter || "Unknown";

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

            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

            report.photo = `uploads/${fileName}`;
        } catch (err) {
            console.error("⚠️ Failed to save photo:", err);
            report.photo = null;
        }
    }

    data.push(report);
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));

    io.emit("newReport", report);
    
    // Send notification for new report
    const notification = {
        id: Date.now(),
        title: "New Report",
        message: `New report submitted by ${report.reporter}`,
        app: "Reports",
        user: "all",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        read: false,
        createdAt: new Date().toISOString()
    };
    
    // Save notification
    const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    notifications.push(notification);
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
    
    // Send real-time notification
    io.emit('newNotification', notification);

    res.json({ message: "Report saved successfully", report });
});

// ------------------ NOTIFICATION ROUTES ------------------ //
app.get("/api/notifications/:username", (req, res) => {
    const { username } = req.params;
    
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
        fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
    }
    
    const allNotifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    const userNotifications = allNotifications.filter(n => n.user === username || n.user === "all");
    
    res.json(userNotifications);
});

app.post("/api/notifications", (req, res) => {
    const { title, message, user, app } = req.body;
    
    if (!title || !message) {
        return res.status(400).json({ success: false, error: "Title and message are required" });
    }
    
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
        fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
    }
    
    const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    
    const newNotification = {
        id: Date.now(),
        title,
        message,
        app: app || "System",
        user: user || "all",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        read: false,
        createdAt: new Date().toISOString()
    };
    
    notifications.push(newNotification);
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
    
    // Send real-time notification via socket
    if (user && user !== "all") {
        // Send to specific user
        for (let [socketId, client] of connectedClients.entries()) {
            if (client.username === user) {
                client.socket.emit('newNotification', newNotification);
                break;
            }
        }
    } else {
        // Send to all connected clients
        io.emit('newNotification', newNotification);
    }
    
    res.json({ success: true, notification: newNotification });
});

// Clear all notifications for a user
app.delete("/api/notifications/:username", (req, res) => {
    const { username } = req.params;
    
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
        fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
    }
    
    const allNotifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    const remainingNotifications = allNotifications.filter(n => n.user !== username);
    
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(remainingNotifications, null, 2));
    
    res.json({ success: true, message: `All notifications cleared for ${username}` });
});

// Get unread count
app.get("/api/notifications/:username/unread", (req, res) => {
    const { username } = req.params;
    
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
        fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
    }
    
    const allNotifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    const userNotifications = allNotifications.filter(n => 
        (n.user === username || n.user === "all") && !n.read
    );
    
    res.json({ count: userNotifications.length });
});

// ------------------ START SERVER ------------------ //
server.listen(PORT, () =>
    console.log(`✅ Server running at http://localhost:${PORT}`)
);