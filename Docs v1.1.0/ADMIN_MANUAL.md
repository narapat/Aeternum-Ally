<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->

# Aeternum Ally - Admin Portal Manual (v1.1.0)

Welcome to the Aeternum Ally Admin Portal. This portal is a secure, platform-wide management interface designed for super-administrators to monitor system health, manage tenant organizations, oversee AI consumption, and control administrator access.

---

## Table of Contents

1. [Accessing the Admin Portal](#1-accessing-the-admin-portal)
2. [Platform Overview (Dashboard)](#2-platform-overview-dashboard)
3. [Company Management](#3-company-management)
4. [Pending Users](#4-pending-users)
5. [AI Usage Tracking](#5-ai-usage-tracking)
6. [Admin Users Management](#6-admin-users-management)

---

## 1. Accessing the Admin Portal

The Admin Portal is completely isolated from the standard multi-tenant sustainability application. 

- Only users explicitly registered as "Platform Admins" can access this interface. 
- Regular organization Owners or Admins within the tenant application **cannot** access the Admin Portal.
- Navigation back to the standard tenant application is available via the "Back to Tenant App" link in the top right header.

---

## 2. Platform Overview (Dashboard)

The Dashboard provides a real-time, high-level summary of the entire platform's health and usage. 

### Key Metrics
- **Total & Active Companies:** Shows the total number of registered organizations and how many are currently active.
- **Total Members:** The aggregate number of users across all tenant organizations.
- **AI Calls Today:** The number of requests made to the Gemini AI API since midnight UTC.
- **AI Errors (Total):** The all-time count of failed AI requests, indicating potential prompt or API instability.

### Usage Charts
- **AI Usage by Month:** A bar chart comparing AI calls routed through the platform's default API key vs. calls made using a customer's own key ("BYOK").
- **AI Calls by Feature:** A stacked bar chart breaking down which specific platform features (e.g., Double Materiality Assessments, SWOT Analysis, KPI Generation) are driving AI token consumption.

*Use the year dropdown in the top right of each chart card to view historical data.*

---

## 3. Company Management

This module allows you to oversee all tenant organizations registered on the platform.

### Creating a New Company
1. Click the **New Company** button.
2. Provide the Company Name and the Owner's Email address.
3. Select a billing/access tier (`free`, `starter`, `pro`, `enterprise`).
4. Click **Create**. The system will generate the organization and automatically send an invitation email to the designated owner. 

### Managing Existing Companies
- **Search & Sort:** Use the search bar to find specific companies, and click column headers to sort by Tier, Member Count, Creation Date, or Status.
- **Detail View:** Click on any company name to view a detailed breakdown of their activity and specific platform statistics.
- **Status Toggle:** Use the **Deactivate / Reactivate** button to freeze or unfreeze an organization's access. Deactivating a company immediately revokes access for all its members.
- **Data Export:** Click **Export** to download a comprehensive archive of the company's sustainability data (useful for manual backups or support requests).

---

## 4. Pending Users

Located under the "Pending Users" tab in the Company Management section, this tool helps you manage users who have signed up but are not yet attached to any organization.

- **Assign to Existing:** If a user signed up independently but belongs to an existing company, you can manually map their email to that organization here.
- **Create New Org:** You can instantly convert a pending user into the Owner of a brand-new organization.

---

## 5. AI Usage Tracking

AI generation represents the primary variable cost for Aeternum Ally. This panel provides granular financial and operational oversight of the platform's AI consumption.

### Summary Metrics
- **Total Calls & Tokens:** Displays the total number of requests, input tokens, and output tokens consumed platform-wide.
- **Estimated Total Cost:** A calculated financial estimate based on the current Gemini pricing models mapped against consumed tokens.
- **Error Rate:** Highlights the percentage of failed AI calls to help diagnose systemic issues.

### Deep-Dive Tables
- **By Action:** A detailed breakdown of token consumption and latency (Avg ms) grouped by specific code actions (e.g., `generate_tasks`, `suggest_kpis`). Use this to identify slow or expensive workflows.
- **Top Companies (This Month):** A leaderboard showing which organizations are consuming the most AI requests in the current month. This is critical for monitoring "free" tier abuse or identifying candidates for upsells.

---

## 6. Admin Users Management

This section controls who has access to this Admin Portal.

- **Add Admin:** Click the **Add Admin** button and enter an email address. The system will send them a secure invitation link granting full platform administrator privileges.
- **Deactivate Admin:** If an administrator leaves the organization, click **Deactivate** next to their name. Their access to the Admin Portal will be revoked immediately.
- **Self-Management:** You cannot deactivate your own account. It will be marked with a "(you)" indicator.
