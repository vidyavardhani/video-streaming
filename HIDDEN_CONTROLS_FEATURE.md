# Hidden Controls Feature - Three-Dot Menu

## Overview
This feature hides all meeting control buttons during an active meeting, showing only the three-dot menu button. When users click the three-dot menu, all controls expand and become visible.

## User Experience

### Default State (Meeting Active)
- Only the three-dot menu button (⋯) is visible
- The button has a subtle pulse animation to indicate it's interactive
- The control bar is compact, taking minimal screen space
- Provides a cleaner, more immersive meeting experience

### Expanded State (Controls Visible)
- Click the three-dot menu button to reveal all controls
- All buttons smoothly animate into view with a scale and fade effect
- The control bar expands to accommodate all buttons
- Click the three-dot menu again or click outside to hide controls

## Implementation Details

### CSS Changes (`app/public/css/style.css`)

1. **Hide Controls by Default**
   - All control buttons except `#control-more` are hidden with opacity and scale transforms
   - Smooth transitions using cubic-bezier easing

2. **Show Controls When Expanded**
   - When `.controls-expanded` class is added to `.meeting-shell`, all buttons become visible
   - Smooth scale and opacity transitions for professional look

3. **Three-Dot Menu Styling**
   - Always visible with full opacity
   - Subtle pulse animation when controls are hidden
   - More prominent appearance to guide users

4. **Control Bar Responsiveness**
   - Compact padding when only three-dot menu is visible
   - Expands when controls are shown
   - Smooth transitions between states

### JavaScript Changes (`app/public/js/class.js`)

1. **openMoreMenu() Function**
   - Adds `.controls-expanded` class to `.meeting-shell`
   - Adds `.menu-open` class to the three-dot button
   - Reveals all control buttons

2. **closeMoreMenu() Function**
   - Removes `.controls-expanded` class from `.meeting-shell`
   - Removes `.menu-open` class from the three-dot button
   - Hides all control buttons except three-dot menu

## Features

✅ Clean, minimalist meeting interface  
✅ Smooth animations and transitions  
✅ Accessible with ARIA attributes  
✅ Keyboard navigation support  
✅ Mobile-responsive design  
✅ Automatic hiding when clicking outside  
✅ Visual feedback with pulse animation  

## Usage

1. **Join a meeting** - Controls start in hidden state
2. **Click the three-dot menu (⋯)** - All controls expand
3. **Click any button or outside the menu** - Controls automatically hide
4. **Click the three-dot menu again** - Toggle controls visibility

## Benefits

- **Better Focus**: Minimalist UI helps participants focus on content
- **More Screen Space**: Hidden controls maximize video viewing area
- **Professional Look**: Clean interface for presentations
- **User-Friendly**: Intuitive three-dot pattern familiar to users
- **Performance**: CSS transforms for smooth 60fps animations

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

## Testing

To test the feature:
1. Start a meeting
2. Observe only the three-dot menu is visible
3. Click the three-dot menu to expand controls
4. Verify all buttons appear smoothly
5. Click outside or on the menu again to collapse
6. Verify controls hide smoothly

## Future Enhancements

Potential improvements:
- Auto-hide controls after period of inactivity
- Toggle option in settings to always show/hide controls
- Custom animation preferences
- Gesture support for mobile devices

