<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->
# AeternumAlly Branding & Design Specification

## Overview
This document outlines the core design language, typography, color palettes, and UI patterns used across the AeternumAlly platform. Consistency in these elements ensures a professional, cohesive, and accessible experience for all users managing their sustainability and ESG workflows.

---

## Typography

The platform utilizes a modern, clean dual-font system served via Google Fonts, optimized for readability and data-heavy interfaces.

- **Headings (`font-heading`)**: **Outfit**
  - Weights: `400` (Regular), `600` (SemiBold), `700` (Bold)
  - Usage: Main application headers, dashboard titles, module titles.
- **Body & Data (`font-sans`)**: **Inter** (Fallback: Noto Sans Thai, sans-serif)
  - Weights: `400` (Regular), `500` (Medium), `600` (SemiBold)
  - Usage: Paragraphs, form inputs, table data, UI text, and secondary labels.

---

## Color Palette

The color system is heavily based on Tailwind CSS's default palette (specifically the `slate` scale for neutrals) alongside a custom `esg` and `brand` palette tailored for the platform's sustainability focus.

### 1. Primary Brand & ESG Colors
These colors are used for primary calls to action, active states, and sustainability-specific highlights.

- **`esg-600` (#16a34a)**: Primary button backgrounds, active navigation highlights.
- **`esg-700` (#15803d)**: Button hover states, avatar backgrounds.
- **`esg-500` (#22c55e)**: Success indicators, progress bars (when exceeding targets).
- **Brand Teal (`brand.teal`: #004d4d)**: Accent branding, dark mode specific elements.
- **Brand Lime (`brand.lime`: #ccff00)**: High-contrast accents.

### 2. UI Neutrals (Slate Scale)
Neutrals are essential for structural elements, typography, and backgrounds across both Light and Dark modes.

| Element | Light Mode | Dark Mode |
|---|---|---|
| **App Background** | `bg-slate-50` | `bg-slate-900` or `bg-slate-950` |
| **Card / Panel** | `bg-white` | `bg-slate-800` |
| **Primary Text** | `text-slate-800` / `text-slate-900` | `text-white` / `text-slate-100` |
| **Secondary Text** | `text-slate-500` | `text-slate-400` |
| **Borders / Dividers** | `border-slate-200` | `border-slate-700` |
| **Input Backgrounds**| `bg-slate-50` / `bg-white` | `bg-slate-950` / `bg-slate-900` |

### 3. Semantic & Feedback Colors
Standardized colors for communicating status and context across dashboards and Task Management.

- **Success / Completed**: `emerald` (`bg-emerald-100 text-emerald-800`, `bg-emerald-500` for bars)
- **Warning / In-Progress**: `amber` (`bg-amber-100 text-amber-800`, `bg-amber-500` for bars)
- **Error / Danger**: `red` (`bg-red-100 text-red-800`, `bg-red-500` for bars)
- **Info / General**: `blue` (`bg-blue-100 text-blue-800`)

---

## Layout & Structure

### 1. Main Application Shell
- **Sidebar Navigation**: Fixed on the left for desktop (`w-64`), collapsible (`w-20`). On mobile, it acts as an off-canvas drawer sliding in from the left with a backdrop blur.
- **Top Header**: Fixed (`sticky top-0 z-10`), height `h-16`. Contains breadcrumbs, system status, and the user profile dropdown.
- **Main Content Area**: Responsive padding (`p-4 md:p-8`). Fills the remaining viewport with overflow handling.

### 2. Card Design (Dashboards & Forms)
Cards are the primary container for information grouping.
- **Classes**: `bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700`
- **Transitions**: Hover effects on interactive cards often utilize `hover:border-esg-400 hover:shadow-md transition-all`.

### 3. Modals & Overlays
- **Backdrop**: `bg-black/50 backdrop-blur-sm`
- **Container**: Max-width tailored to content (e.g., `max-w-2xl`, `max-w-4xl`), `rounded-xl`, `shadow-2xl`.

---

## UI Components & Patterns

### 1. Buttons
- **Primary**: `bg-esg-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-esg-700 transition-colors`
- **Secondary / Ghost**: `text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg`
- **Destructive**: Uses `red` scale (`bg-red-50 text-red-600 hover:bg-red-100`).
- **Icons in Buttons**: Lucide-react icons are typically placed to the left of the text, sized `w-4 h-4`, with a `gap-2` flex layout.

### 2. Forms & Inputs
- **Inputs/Selects/Textareas**: `w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white`
- **Labels**: `block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1`

### 3. Badges & Tags
Used extensively for categorizing tasks, source types, and materiality statuses.
- **Shape**: Typically `rounded` or `rounded-full`, with `px-2 py-0.5` or `px-2.5 py-1`.
- **Text**: `text-xs font-medium` or `font-bold uppercase tracking-wide`.

### 4. Icons
All icons are provided by **Lucide React**. 
- Standard size: `w-5 h-5` (navigation/headers) or `w-4 h-4` (inline/buttons).
- Stroke width: Default `2px`.

---

## Dark Mode Implementation
The application fully supports Dark Mode via the `class` strategy in Tailwind CSS. 
- The toggle state is persisted locally in `localStorage` (`aeternum_darkmode`).
- All custom components must include the `dark:` variant counterpart for backgrounds, text, borders, and hover states.
- The root `<div>` or `<body>` orchestrates the theme switch (`bg-slate-50 dark:bg-slate-900 transition-colors duration-300`).
