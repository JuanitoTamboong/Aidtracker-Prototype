# Fix "Show All" Button in Police Dashboard

## Issue
- Clicking "Show All" in police.html shows no accidents
- Dashboard only processes reports with specific types ('motor_accident' or 'assault_crime')
- Skips other incident types, resulting in no markers
- Leaflet error: "Cannot read properties of null (reading '_latLngToNewLayerPoint')"

## Solution
- Modify `processReport()` to process all reports instead of skipping non-matching types
- Add default incident type for unmatched reports
- Ensure police can see all incidents for comprehensive response
- Improve `fitAllMarkers()` function to handle edge cases

## Tasks
- [x] Update `typeConfig` to include default type
- [x] Modify `processReport()` logic to always process reports
- [x] Improve `fitAllMarkers()` to prevent Leaflet errors
- [x] Test the fix by loading the dashboard
