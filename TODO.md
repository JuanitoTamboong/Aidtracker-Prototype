# TODO: Fix View Report for Every Station

## Task
Add "View Location" button to each station dashboard (fire, police, ambulance) to allow viewing detailed accident location on map.

## Status: IN PROGRESS

### 1. Fire Station (fire.html)
- [x] Add CSS style for `location-btn` button
- [x] Modify `createReportCard` function to include "View Location" button
- [x] Add `viewLocation` function to save location to sessionStorage and navigate to view-report.html
- [x] Expose `viewLocation` function globally

### 2. Police Station (police.html)
- [x] Add CSS style for `location-btn` button
- [x] Modify `createReportCard` function to include "View Location" button
- [x] Add `viewLocation` function to save location to sessionStorage and navigate to view-report.html
- [x] Expose `viewLocation` function globally
- [x] Fix duplicate logout() function definition

### 3. Ambulance Station (ambulance.html)
- [x] Add CSS style for `location-btn` button
- [x] Modify `createReportCard` function to include "View Location" button
- [x] Add `viewLocation` function to save location to sessionStorage and navigate to view-report.html
- [x] Expose `viewLocation` function globally

## Implementation Details

The viewLocation function:
1. Saves the report's location data to sessionStorage:
   - viewLocation: JSON with lat, lng
   - viewReportId: report ID
2. Navigates to view-report.html

Example implementation:
```
javascript
function viewLocation(report) {
  sessionStorage.setItem('viewLocation', JSON.stringify({
    lat: report.latitude,
    lng: report.longitude
  }));
  sessionStorage.setItem('viewReportId', report.id);
  window.location.href = 'view-report.html';
}
```

## Files Modified
1. Aidtracker-Prototype/fire.html
2. Aidtracker-Prototype/police.html
3. Aidtracker-Prototype/ambulance.html
