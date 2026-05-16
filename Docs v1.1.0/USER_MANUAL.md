<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->
# AeternumAlly - User Manual (v1.1.0)

Welcome to AeternumAlly! This platform guides your organization through a structured sustainability reporting workflow, allowing you to generate a draft Sustainability Statement aligned with ESRS (European Sustainability Reporting Standards) and GRI standards, all without needing prior expertise.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Navigating the App](#2-navigating-the-app)
3. [My Business](#3-my-business)
4. [Double Materiality](#4-double-materiality)
5. [Measurement](#5-measurement)
6. [Reports](#6-reports)
7. [Workspace & Settings](#7-workspace--settings)
8. [Example Use Cases & Scenarios](#8-example-use-cases--scenarios)
9. [Troubleshooting](#9-troubleshooting)
10. [Support & Feedback](#10-support--feedback)

---

## 1. Getting Started

### Authentication
AeternumAlly uses a combination of email magic-links for account creation and standard email/password for day-to-day login.
- **New Users & Invites:** When creating an account or accepting a team invite, you will receive an email magic-link. Clicking this link securely sets up your account.
- **Returning Users:** The main authentication method is email and password. Enter your registered credentials on the sign-in screen to access your workspace.

*Note: If you forget your password, you can request a password reset link from the sign-in page.*

### Organization Setup
Upon your first login:
- If you are creating a new workspace, click **Create Organization**. You will be assigned the Owner role.
- If you were invited by a colleague, clicking the invite link will automatically add you to their organization.

**Why is this important?** 
Proper workspace setup ensures that your sensitive corporate data is securely isolated. Team roles are crucial for maintaining data integrity while allowing collaboration across departments.

---

## 2. Navigating the App

The left sidebar contains the main navigation menu, structured sequentially to mimic the logical flow of a professional sustainability assessment. 

| Section | What it does |
|---|---|
| **Overview** | A data completeness dashboard showing your overall progress. |
| **My Business** | Define your company, business model, and strategic position (SWOT). |
| **Double Materiality** | Score and assess ESRS topics for impact and financial materiality. |
| **Measurement** | Define KPIs, manage sustainability tasks, and track carbon emissions. |
| **Reports** | Generate your final Sustainability Statement based on your entered data. |

**Pro Tips:**
- **Collapse the Sidebar**: Use the double-arrow icon at the bottom of the sidebar to gain more screen space.
- **Dark Mode**: Toggle between light and dark modes via the user dropdown menu in the top right.

---

## 3. My Business

This section captures your core business identity and strategy. The information here establishes the foundation for the entire platform.

**Why is this important?**
The AI engine relies heavily on this data to provide tailored, context-aware sustainability suggestions. If the AI doesn't understand your business model, it cannot accurately suggest relevant material impacts or KPIs. 

**How it relates to other sections:**
Data from your Profile, Sustainability Business Canvas Model (SBCM)), and SWOT Analysis directly inform the auto-fill capabilities in the **Double Materiality Assessments** and the final narrative in the **Reports** section.

### Company Profile
Enter your basic company information (Name, Industry, Size, Revenue). 
Crucially, fill out the **General Description**, **Mission**, and **Vision**. The more detailed you are, the better the AI can contextualize its recommendations.

### Business Model Canvas
An interactive tool mapping how you create and deliver value. 
- You can manually add blocks (Key Partners, Value Proposition, etc.) or use the **AI Suggestion** feature to automatically generate ideas based on your Company Profile.
- The canvas includes "Eco-Social Costs" and "Eco-Social Benefits" to directly link your business model to sustainability impacts.
- **Learn more about Business Models:** [Strategyzer - The Business Model Canvas](https://www.strategyzer.com/canvas/business-model-canvas)

### SWOT Analysis
Analyze your internal Strengths/Weaknesses and external Opportunities/Threats. 
- Use the **AI Wizard** to perform grounded web searches to discover real-world market trends and regulatory threats specific to your industry.
- **Learn more about SWOT Analysis:** [MindTools - SWOT Analysis](https://www.mindtools.com/pages/article/newTMC_05.htm)

---

## 4. Double Materiality

The core engine of AeternumAlly. You evaluate topics across two dimensions: 
1. **Impact Materiality:** How your company impacts people and the environment (Inside-Out).
2. **Financial Materiality:** How sustainability issues create financial risks or opportunities for your company (Outside-In).

**Why is this important?**
Double Materiality is the mandatory starting point for compliance with the EU's Corporate Sustainability Reporting Directive (CSRD). It determines *which* specific topics your company is legally required to report on.

**How it relates to other sections:**
Topics deemed "Material" here flow directly into your **Measurement (KPIs and Tasks)** to be managed, and form the structural backbone of your final **Sustainability Statement (Reports)**.

### Materiality Dashboard
Provides a visual scatter plot (**Materiality Matrix**) of all your assessed topics. The chart visually categorizes your ESRS topics into three tiers based on their calculated scores (0-100):
- **High Impact Material (Green Dot):** The topic has a Financial score greater than 60, indicating a severe risk or major opportunity.
- **Material (Orange Dot):** The topic scores above the standard materiality threshold of 40 on *either* the Impact or Financial axis, legally requiring it to be reported.
- **Not Material (Grey Dot):** The topic scores 40 or below on both axes and does not require inclusion in your final Sustainability Statement.

### Assessments
This is a guided two-step process to evaluate a specific sustainability topic.

**Step 1: Fill Descriptions**
1. Click **New Assessment** and select an ESRS topic from the dropdown (e.g., E1 Climate Change).
2. You can manually write the Impact and Financial descriptions, or click the **AI Auto-Fill** button. This uses your Company Profile, Business Model, and SWOT data to draft tailored descriptions. 
*(Note: If you opened the assessment from the DMA Insight Hub to fix a quality issue, a banner will appear, and AI Auto-Fill will specifically address those issues).*

**Step 2: AI Scores & Reasoning**
Once your descriptions are filled out, the **Get Suggestions** button becomes available in the top toolbar.
1. Click **Get Suggestions** to ask the AI to evaluate your descriptions.
2. The AI will populate the score dropdowns (Scale, Scope, Irremediability, Likelihood, Magnitude). Dropdowns with an AI suggestion will have a green border.
3. Next to each score, click the **"?"** icon to open the **AI Reasoning modal**. This provides a detailed explanation of why the AI assigned that specific score.
4. **Overrides:** If your internal knowledge differs, simply change the score via the dropdown. The border will turn amber, and a "Use AI" link will appear, allowing you to easily revert to the AI's suggestion. You can also click "Reset to AI" in the toolbar to revert all overrides.
5. The system will automatically calculate the final Impact and Financial scores out of 100. If either score exceeds 40, the topic is deemed "Material."
6. Click **Complete Assessment** (or Update Assessment) to save your results to the matrix.

### DMA Insight Hub
The Insight Hub is a key differentiator of AeternumAlly, moving you beyond mere compliance tracking into active strategic management. It acts as an automated sustainability consultant, performing a deep, two-pass AI analysis of all your assessments.

**Key Features & Behavior:**
- **Automatic Loading:** When you open the page, it automatically fetches completed analyses from the database. If none exist or a previous one failed, it automatically triggers a new analysis.
- **Visual Loading States:** Skeletons for Strategic Insight and Recommended Actions appear immediately when an analysis starts (or is found processing on load), alongside the Quality Check cards.
- **Re-analyse Button:** This prominent filled button allows you to manually trigger a fresh analysis. If the process appears stuck in an infinite spin, you can click it again to force a restart (a browser prompt will ask for confirmation).

**Phase 1: Quality Check (Topic Level)**
The AI evaluates every completed assessment individually against strict ESRS requirements.
- **Score Banner:** Provides a real-time summary of your reporting readiness, tracking how many topics are covered, how many are material, and your overall quality status.
- **Quality Status Cards:** Topics are flagged as **Complete** (green), **Should Review** (amber), or **Must Fix** (red). 
- **Actionable Feedback:** Expanding a flagged topic reveals specific issues, their severity, the relevant ESRS clause, and a concrete "Fix suggestion." You can click directly into the assessment to correct the gaps.

**Phase 2: Strategic Synthesis (Company Level)**
Once quality checks are complete, the AI synthesizes your materiality data against your Company Profile, Business Model, and SWOT analysis to generate a holistic strategy.
- **Strategic Insight Panel:** Delivers an executive summary, pinpointing cross-functional **Key Risks** and **Opportunities**, and provides a high-level **Bottom Line**.
- **Recommended Actions:** Generates a prioritized task list categorized into:
  - **Fix:** Immediate actions to correct inconsistent reporting.
  - **Comply:** Steps required to meet mandatory ESRS compliance.
  - **Improve:** Strategic initiatives that drive real business value beyond mere reporting.
*(Note: These recommended actions automatically flow into your **Action Plan (Tasks)** where they can be assigned to team members for execution.)*

**External Resources:**
- [EFRAG - European Sustainability Reporting Standards (ESRS)](https://www.efrag.org/lab6)
- [GRI - Understanding Double Materiality](https://www.globalreporting.org/standards/understanding-the-gri-standards/double-materiality/)

---

## 5. Measurement

Turn your materiality assessments into measurable goals, manageable tasks, and trackable emissions.

**Why is this important?**
Reporting is only half of the requirement; regulators and investors want to see that you are actively managing your material impacts and tracking progress toward targets.

**How it relates to other sections:**
The KPIs and Tasks created here are responses to the risks identified in the **Double Materiality** section. This data is then compiled into the metrics section of your final **Sustainability Statement**.

### Performance (KPI)
Track initiatives using the Balanced Scorecard (BSC) framework.
- Manually create KPIs or click **Suggest KPIs** to let the AI generate metrics based on your material topics.
- Track current values vs. target values, and assign ownership (RACI).

### Action Plan (Tasks)
This module acts as the "Do" phase of your continuous sustainability PDCA loop (Plan -> Do -> Check -> Act). It turns the risks identified in your materiality assessments (Plan) into executable actions to be managed (Do) before measuring the outcome in KPIs (Check/Act).

**Key Features:**
- **AI Task Generator:** AI automatically analyses your material topics, DMA Insight Hub feedback, and KPIs to suggest a prioritized action list.
- **Categorized Actions:** Tasks are smartly grouped into three types:
  - **Fix (Red):** Correct immediate reporting gaps or inconsistencies.
  - **Comply (Blue):** Mandated steps to meet ESRS requirements.
  - **Improve (Green):** Strategic initiatives for long-term value.
- **Task Management:** Assign tasks to specific team members, set due dates, add custom notes, and track statuses (To Do → In Progress → Done).
- **Offline Updates (Excel):** Export your entire task list to Excel, update statuses or assignees offline, and import it back to sync changes instantly.
- **Evidence Collection:** Link Google Drive documents directly to tasks to seamlessly compile audit evidence.

### Carbon Accounting
Measuring greenhouse gas (GHG) emissions is notoriously complex. AeternumAlly uses gamification to eliminate this barrier to entry, guiding you seamlessly from zero to a baseline carbon footprint.

- **Carbon Quest Wizard:** A highly gamified, interactive onboarding experience that breaks down complex carbon accounting into three digestible "Missions":
  - **Mission 1 (Scope 2 - Electricity):** Starts with the easiest data to gather (electric bills), with AI Copilot bubbles providing regional averages to guide you.
  - **Mission 2 (Scope 1 - Direct):** A checklist approach to select your direct emission sources (vehicles, boilers). You input fuel amounts, and the wizard automatically applies the correct localized emission factors to calculate the CO₂e instantly.
  - **Mission 3 (Scope 3 - Supply Chain):** Presented as an optional "Bonus Mission" for overachievers, ensuring you aren't overwhelmed by data that isn't strictly necessary for a baseline report.
  - **Rewards:** Celebration modals appear after each mission, translating abstract carbon tonnage into tangible, understandable analogies (e.g., "that's 50,000 km driven!").
- **Carbon Dashboard:** Once your baseline is established via the wizard, you unlock the full dashboard to view your emissions breakdown across all scopes, track reduction progress over time, and optionally connect Google Drive for evidence collection.

**External Resources:**
- [GHG Protocol - Corporate Standard (Carbon Accounting)](https://ghgprotocol.org/corporate-standard)
- [Balanced Scorecard Institute - Basics of BSC](https://balancedscorecard.org/bsc-basics-overview/)

---

## 6. Reports

This section generates your final deliverable.

**Why is this important?**
This produces the formatted documentation you need to share with auditors, supply chain partners, investors, or regulators to prove compliance and transparency.

**How it relates to other sections:**
This is the culmination of the entire app. It automatically pulls your context from **My Business**, your material topics from **Double Materiality**, and your targets from **Measurement**, synthesizing them into a cohesive narrative.

### Sustainability Statement
When you are ready, generate a structured report compliant with **ESRS 2 (General Disclosures)** and **Topical Standards**.
1. Navigate to Reports > Sustainability Statement.
2. Click **Generate Statement**. The AI compiles all your data, assessments, and KPIs into a readable report.
3. The report includes a **GRI Content Index** mapping ESRS topics to GRI standards, ensuring interoperability with global frameworks.
4. Export the final document to PDF using your browser's print function (`Ctrl+P` or `Cmd+P` -> Save as PDF).

**External Resources:**
- [GRI - Global Reporting Initiative Standards](https://www.globalreporting.org/how-to-use-the-gri-standards/)

---

## 7. Workspace & Settings

Access Settings by clicking your user avatar in the top right corner.

### Team Management
Owners and Admins can invite new members to collaborate.
1. Enter the member's email address.
2. Select a role:
   - **Admin:** Full access and member management.
   - **Manager:** Full access to sustainability data.
   - **Consultant:** Read-only access for external advisors or auditors.
3. Send the invite link.

### AI Usage Panel
Monitor your organization's API token consumption. This provides a transparent log of which features triggered AI calls, what model was used, and the tokens consumed, which is particularly useful for organizations tracking IT costs or self-hosting the application.

---

## 8. Example Use Cases & Scenarios

To help you understand how AeternumAlly works in practice, here are two common scenarios.

### Scenario A: The Packaging Manufacturer (B2B SME)
**The Situation:** EcoPack Ltd. manufactures cardboard packaging. A major corporate client recently requested their carbon footprint and a sustainability report to comply with the client's own supply chain requirements.
**The Workflow:**
1. **My Business:** EcoPack fills out their company profile. In the Business Model Canvas, the AI helps them identify "Energy-intensive machinery" as a key cost and "Recycled materials" as a key resource. 
2. **Double Materiality:** They assess *E1 (Climate Change)* and *E5 (Resource Use and Circular Economy)*. The AI drafts impact descriptions showing that high energy use is a financial risk (energy costs) and an impact risk (carbon emissions). Both land in the upper-right "Material" quadrant of the matrix.
3. **Measurement:** They use the Carbon Quest Wizard to calculate their Scope 1 & 2 emissions. The AI suggests a KPI: "Reduce Scope 2 emissions by 15%." They assign a task to the Facilities Manager to research renewable energy providers.
4. **Reports:** EcoPack generates their Sustainability Statement. It clearly outlines their reliance on recycled materials and their new target to reduce emissions, satisfying their corporate client's request.

### Scenario B: The Tech Startup (Preparing for Funding)
**The Situation:** CloudData Inc. is a SaaS company seeking Series A funding. Investors are increasingly asking for ESG metrics to assess long-term risk.
**The Workflow:**
1. **My Business:** CloudData completes their profile. The SWOT AI Wizard searches the web and identifies a regulatory threat: "Upcoming strict data privacy regulations in the EU."
2. **Double Materiality:** They run an assessment on *S4 (Consumers and End-users)* and *G1 (Business Conduct)*. Since they don't produce physical goods, their environmental impact is low, but the AI highlights "Data Privacy and Security" as highly material for financial risk. 
3. **Measurement:** They create KPIs around "Number of Data Breaches" and "Percentage of Employees with Security Training."
4. **Reports:** The generated report focuses heavily on their robust governance and data protection strategies, demonstrating to investors that they are proactively managing their most critical ESG risks.

---

## 9. Troubleshooting

- **Login Link Expired:** Return to the login page and request a new link. Check your spam folder if it doesn't arrive.
- **AI Features Unresponsive:** If using the live demo, the shared quota may be temporarily exhausted. If self-hosting, ensure your `GEMINI_API_KEY` is configured correctly in your environment variables.
- **Data Not Saving:** Look for the spinning save indicator in the top right. If an error persists, refresh the page.
- **Empty Materiality Matrix:** Ensure you have completed at least one Double Materiality Assessment.
- **Missing Sidebar Sections:** Some features are role-restricted. Consultants (Read-Only) will not see management or destructive actions. Contact your Workspace Owner if you need your role upgraded.

---

## 10. Support & Feedback

If you encounter any problems with the application, have questions, or want to share suggestions, you have several options:

- **Ally Assistant (Recommended)**: Click the floating "Ally" icon on the screen. Ally can automatically understand your current page context and help collect your information to send directly to support!
- **GitHub Issues**: You can report issues directly on our <a href="https://github.com/narapat/Aeternum-Ally/issues" target="_blank">GitHub Repository</a>.
- **Email**: Send an email directly to [Support@aeternumally.com](mailto:Support@aeternumally.com).
