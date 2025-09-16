# D&D App Styling Guide

## Overview
This styling guide defines the design system for the Dungeons & Dragons application. All new components should follow these patterns to maintain visual consistency with the existing dashboard design.

## Color Palette

### Primary Colors
```css
--primary-black: #0f0f0f        /* Main background */
--secondary-black: #1a1a1a      /* Secondary background */
--accent-black: #2d2d2d         /* Accent elements */
```

### Gold Theme
```css
--primary-gold: #c9a961         /* Primary gold for text and accents */
--secondary-gold: #b8941f       /* Secondary gold for interactions */
--accent-gold: #ddbf5f          /* Light accent gold */
--light-gold: #e8d5a3           /* Very light gold */
--metallic-gold: #d4c19c        /* Main metallic gold (borders, text) */
--dark-gold: #a67c00            /* Dark gold for depth */
```

### Text Colors
```css
--text-primary: #ffffff         /* Primary white text */
--text-secondary: #e8e8e8       /* Secondary text */
--text-muted: #b8b8b8           /* Muted/disabled text */
--text-gold: var(--metallic-gold) /* Gold text for headings */
```

## Background System

### App Background (Body)
The main application background uses a subtle gradient with noise texture:
```css
body {
  background: var(--bg-primary);
  background-image: 
    radial-gradient(circle at 20% 50%, rgba(212, 193, 156, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(201, 169, 97, 0.06) 0%, transparent 50%),
    radial-gradient(circle at 40% 80%, rgba(184, 148, 31, 0.05) 0%, transparent 50%),
    radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0);
  background-size: 100% 100%, 100% 100%, 100% 100%, 3px 3px;
}
```

### Main Panel Background
**CRITICAL:** All main component containers must use the textured background image:
```css
.main-container {
  background-image: url('../assets/images/backgrounds/BlackBackground.avif');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border: 1px solid rgba(212, 193, 156, 0.3);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xxl);
  box-shadow: 
    0 0 20px rgba(212, 193, 156, 0.15),
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
```

### Main Panel Glow Effect
Add this glowing border to main containers:
```css
.main-container::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  right: -1px;
  bottom: -1px;
  background: linear-gradient(135deg, 
    rgba(212, 193, 156, 0.4) 0%, 
    rgba(212, 193, 156, 0.1) 25%, 
    rgba(212, 193, 156, 0.05) 50%, 
    rgba(212, 193, 156, 0.1) 75%, 
    rgba(212, 193, 156, 0.4) 100%);
  border-radius: var(--radius-lg);
  z-index: -1;
  opacity: 0.7;
}
```

## Glass Morphism Panels

### Base Glass Panel
Use for secondary content areas within main containers:
```css
.glass-panel {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
```

### Glass Panel Top Highlight
Add subtle highlight effect:
```css
.glass-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
}
```

### Glass Panel Variants
```css
/* Primary gold accent */
.glass-panel.primary {
  background: rgba(212, 193, 156, 0.15);
  border: 1px solid rgba(212, 193, 156, 0.3);
}

/* Success/positive states */
.glass-panel.success {
  background: rgba(40, 167, 69, 0.15);
  border: 1px solid rgba(40, 167, 69, 0.3);
}

/* Info/neutral states */
.glass-panel.info {
  background: rgba(212, 193, 156, 0.1);
  border: 1px solid rgba(212, 193, 156, 0.2);
}
```

## Typography

### Headers
```css
/* Main titles - Fantasy font with gradient */
h1 {
  font-size: 2.5rem;
  font-family: var(--font-fantasy); /* 'Cinzel', serif */
  color: var(--text-gold);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

/* Section headers */
h2 {
  font-size: 2rem;
  font-family: var(--font-fantasy);
  color: var(--text-gold);
}

/* Subsection headers */
h3 {
  font-size: 1.5rem;
  color: var(--text-gold);
}
```

### Body Text
```css
p {
  color: var(--text-secondary);
  line-height: 1.6;
}
```

### Gold Gradient Text Effect
For special titles:
```css
.app-title {
  background: var(--gradient-gold);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  position: relative;
  text-shadow: none;
}
```

## Form Elements

### Form Inputs
```css
.form-input {
  width: 100%;
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 1rem;
  transition: all var(--transition-normal);
  box-shadow: 
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.form-input:focus {
  outline: none;
  border-color: rgba(212, 193, 156, 0.5);
  box-shadow: 
    0 0 0 2px rgba(212, 193, 156, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.12);
}
```

### Form Labels
```css
.form-label {
  display: block;
  color: var(--text-gold);
  font-weight: 500;
  margin-bottom: var(--spacing-sm);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

## Buttons

### Primary Button (Gold)
```css
.btn-primary {
  background: var(--gradient-gold);
  color: var(--primary-black);
  border: none;
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--radius-md);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-dark);
  background-size: 200% 100%;
  animation: shimmer 3s ease-in-out infinite;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(212, 193, 156, 0.5);
  background: var(--gradient-gold-reverse);
}
```

### Secondary Button (Outline)
```css
.btn-secondary {
  background: transparent;
  color: var(--text-gold);
  border: 2px solid var(--border-gold);
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--radius-md);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all var(--transition-normal);
}

.btn-secondary:hover {
  background: var(--gradient-gold);
  color: var(--primary-black);
  box-shadow: var(--shadow-gold);
}
```

## Alert/Message Components

### Glass Morphism Alerts
```css
.alert {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-lg);
  border: 1px solid;
  position: relative;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.alert::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
}
```

### Alert Variants
```css
.alert-error {
  border-color: rgba(220, 53, 69, 0.5);
  color: #ff6b6b;
  background: rgba(220, 53, 69, 0.15);
}

.alert-success {
  border-color: rgba(40, 167, 69, 0.5);
  color: #51cf66;
  background: rgba(40, 167, 69, 0.15);
}

.alert-info {
  border-color: rgba(212, 193, 156, 0.5);
  color: var(--text-gold);
  background: rgba(212, 193, 156, 0.15);
}
```

## Animations

### Entrance Animation
```css
.fade-in {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Shimmer Effect (Gold Elements)
```css
@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}
```

## Component Structure Pattern

### Standard Component Layout
```tsx
const MyComponent: React.FC = () => {
  return (
    <div className="container fade-in">
      <div className="main-container"> {/* Use dashboard-container or similar naming */}
        
        {/* Header Section */}
        <div className="app-header">
          <h1 className="app-title">Component Title</h1>
          <p className="app-subtitle">Optional subtitle</p>
        </div>

        {/* Primary Content Panels */}
        <div className="glass-panel primary">
          <h3>Primary Section</h3>
          <p>Main content here</p>
        </div>

        {/* Secondary Content Panels */}
        <div className="glass-panel info">
          <h4>Secondary Section</h4>
          <p>Additional content</p>
        </div>

        {/* Action Area */}
        <div className="text-center mt-lg">
          <button className="btn btn-primary">Primary Action</button>
          <button className="btn btn-secondary">Secondary Action</button>
        </div>

      </div>
    </div>
  );
};
```

## CSS Custom Properties Reference

### Spacing
```css
--spacing-xs: 0.25rem    /* 4px */
--spacing-sm: 0.5rem     /* 8px */
--spacing-md: 1rem       /* 16px */
--spacing-lg: 1.5rem     /* 24px */
--spacing-xl: 2rem       /* 32px */
--spacing-xxl: 3rem      /* 48px */
```

### Border Radius
```css
--radius-sm: 4px
--radius-md: 8px
--radius-lg: 12px
--radius-xl: 16px
```

### Transitions
```css
--transition-fast: 0.2s ease
--transition-normal: 0.3s ease
--transition-slow: 0.5s ease
```

### Shadows
```css
--shadow-gold: 0 0 15px rgba(212, 193, 156, 0.4)
--shadow-dark: 0 4px 8px rgba(0, 0, 0, 0.5)
```

### Gradients
```css
--gradient-gold: linear-gradient(135deg, #d4c19c 0%, #c9a961 25%, #b8941f 50%, #c9a961 75%, #d4c19c 100%)
--gradient-gold-reverse: linear-gradient(315deg, #d4c19c 0%, #c9a961 25%, #b8941f 50%, #c9a961 75%, #d4c19c 100%)
--gradient-black: linear-gradient(135deg, var(--primary-black), var(--secondary-black))
```

## Utility Classes

### Text Utilities
```css
.text-center { text-align: center; }
.text-gold { color: var(--text-gold); }
.text-muted { color: var(--text-muted); }
```

### Spacing Utilities
```css
.mt-lg { margin-top: var(--spacing-lg); }
.mb-lg { margin-bottom: var(--spacing-lg); }
```

### Display Utilities
```css
.hidden { display: none; }
.btn-full { width: 100%; }
```

## Best Practices

1. **Always use the textured background** (`BlackBackground.avif`) for main component containers
2. **Use glass morphism panels** for secondary content areas within main containers
3. **Maintain the gold and black color scheme** throughout all components
4. **Apply consistent spacing** using CSS custom properties
5. **Include hover effects** on interactive elements
6. **Use the fade-in animation** for component entrances
7. **Follow the component structure pattern** for consistency
8. **Apply appropriate glass panel variants** based on content type (primary, success, info)
9. **Use metallic gold for text** and accent elements
10. **Include subtle animations** like shimmer effects on gold elements

## File Paths
- **Background Image:** `src/assets/images/backgrounds/BlackBackground.avif`
- **Main Styles:** `src/styles/theme.css`
- **Font Family:** Primary: 'Segoe UI', Fantasy: 'Cinzel'

This guide ensures all new components maintain visual consistency with the established D&D theme and dashboard design.