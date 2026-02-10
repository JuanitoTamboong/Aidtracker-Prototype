# TODO: Fix Notification Bell Navigation

## Steps to Complete
- [x] Update package.json: Remove "type": "module" to switch from ES modules to CommonJS
- [x] Update server.js: Convert import statements to require(), and change export default to module.exports
- [x] Uncomment catch-all route for local SPA routing
- [x] Fix notification bell URLs to use absolute paths (/police-notif, /fire-notif, /ambulance-notif)
- [x] Update Vercel config to serve all HTML files
- [ ] Test locally and ensure it works both locally and on Vercel

## Progress
- Fixed notification bell navigation URLs in all dashboard HTML files
- Updated Vercel config to serve all HTML files statically
- Local testing: Run `npm install` then `npm start` in Aidtracker-Prototype directory
- Server should start on http://localhost:3000
- Next: Test both local and Vercel deployment

## Local Setup Instructions
1. Navigate to Aidtracker-Prototype directory
2. Run `npm install` to install dependencies
3. Run `npm start` to start the server
4. Open http://localhost:3000 in browser
5. Test login and navigation - should work same as Vercel
6. Click notification bell in police/fire/ambulance dashboards - should navigate correctly

## Fixed Issues
- Notification bell URLs now use absolute paths (/police-notif, /fire-notif, /ambulance-notif)
- Vercel config updated to serve all HTML files
- Local development routing fixed with catch-all route
