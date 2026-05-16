<!-- Version: 1.0.0 — Last updated: 2026-05-01 -->

# AeternumAlly 🌿
> **AI-Powered Sustainability Management & Reporting for SMEs**

AeternumAlly is a SaaS platform designed to democratize professional-grade sustainability reporting. It guides Small and Medium Enterprises (SMEs) through the complex landscape of **ESRS (European Sustainability Reporting Standards)** and **CSRD (Corporate Sustainability Reporting Directive)** compliance using an intuitive, AI-assisted workflow.

---

## 💡 Concept
The gap between traditional business strategy and sustainability compliance is often vast and expensive to bridge. **AeternumAlly** integrates the **Sustainable Business Model Canvas** directly with **Double Materiality Assessments**. 

By understanding a company's business model first, the platform uses Generative AI (Google Gemini) to intelligently suggest relevant environmental and social impacts, risks, and opportunities, turning a compliance burden into a strategic advantage.

## 🎯 Objective
*   **Simplify Compliance:** Make ESRS and GRI standards accessible to non-experts.
*   **Reduce Costs:** Eliminate the need for expensive initial consulting phases by automating the discovery of material topics.
*   **Strategic Alignment:** Ensure sustainability initiatives drive actual business value by linking them to KPIs and financial materiality.
*   **Actionable Reporting:** Move beyond "tick-box" exercises to generate meaningful Sustainability Statements.

## 👥 Target User
*   **SME Owners & Managers:** Who need to comply with supply chain pressure or regulations but lack a dedicated ESG team.
*   **Sustainability Officers:** Who need a structured tool to manage data and track progress over time.
*   **ESG Consultants:** Who can use the platform to streamline client assessments and report generation.

---
<img width="1434" height="696" alt="image" src="https://github.com/user-attachments/assets/eedde9db-dd71-4223-8eeb-ba6fb1b06cb8" />

## 🚀 Key Features & Workflow

### 1. Sustainable Business Model Canvas
An interactive canvas that extends the traditional business model to include **Eco-Social Costs** and **Benefits**.
*   **Feature:** AI-assisted brainstorming for every block (e.g., "Suggest Value Propositions for a Recycled Packaging company").
*   **Screen:** A digital canvas grid where users define their value chain, which feeds into the risk assessment engine.
<img width="1440" height="699" alt="image" src="https://github.com/user-attachments/assets/49390a28-e94b-4533-87fd-de0345b264fe" />


### 2. Double Materiality Assessment (AI-Assisted)
The core engine of the platform. It evaluates topics based on two dimensions:
1.  **Impact Materiality (Inside-Out):** Impact on people and the planet.
2.  **Financial Materiality (Outside-In):** Financial risks and opportunities for the company.
*   **Feature:** **Auto-Fill Impact & Risks**. The AI analyzes the company profile and selected topic (e.g., *E1 Climate Change*) to draft specific impact descriptions and financial risks automatically.
*   **Visualization:** A dynamic **Materiality Matrix** scatter plot that visually separates "Material" topics from "Low Impact" ones based on a threshold.
<img width="1440" height="696" alt="image" src="https://github.com/user-attachments/assets/f1e00b90-3c37-49ed-b192-4a61969a711b" />
<img width="1440" height="695" alt="image" src="https://github.com/user-attachments/assets/5173787c-929d-4aa7-874f-f6b9dde13014" />
<img width="1440" height="699" alt="image" src="https://github.com/user-attachments/assets/0a4bfee6-271a-4c1d-8461-1d1bd6871007" />





### 3. SWOT Analysis Wizard
A step-by-step wizard to analyze internal strengths/weaknesses and external opportunities/threats.
*   **Feature:** **Google Search Grounding**. The AI searches live web data to find real-world market trends and regulatory threats relevant to the specific industry, populating the Opportunities/Threats section with up-to-date information.
<img width="1440" height="697" alt="image" src="https://github.com/user-attachments/assets/3bd87f7e-8172-47e3-8b41-44a1208dacd8" />


### 4. Performance Dashboard (KPIs)
Track execution using the **Balanced Scorecard (BSC)** framework.
*   **Feature:** Suggests strategic KPIs based on the company description.
*   **Feature:** Tracks current vs. target values with visual progress bars and RACI ownership assignment.
<img width="1440" height="701" alt="image" src="https://github.com/user-attachments/assets/b99a6271-6d5e-487c-8bbd-c10df7d24e10" />

<img width="1440" height="703" alt="image" src="https://github.com/user-attachments/assets/09671bc2-1680-4ad6-81b3-79d91f6cdb84" />


### 5. Automated Sustainability Statement
Generates a report compliant with **ESRS 2 (General Disclosures)** and **Topical Standards**.
*   **Feature:** One-click generation of the "Sustainability Statement".
*   **Feature:** Includes a **GRI Content Index** table, mapping ESRS topics to GRI standards for interoperability.
*   **Output:** A clean, formatted document ready for export to PDF.
<img width="1440" height="697" alt="image" src="https://github.com/user-attachments/assets/1a9b799e-b641-4c55-9bc4-c236b76d7381" />

<img width="1440" height="699" alt="image" src="https://github.com/user-attachments/assets/11a8b0c1-8c0f-461a-a3ea-4426d4717457" />

<img width="1440" height="701" alt="image" src="https://github.com/user-attachments/assets/5c1c3168-a773-48d8-b301-af11da7216e4" />

---

## 🛠️ Quick start

Prerequisites: **Node 20+**, **npm**, a **Supabase** project, a **Google Gemini API key**.

```bash
git clone <this-repo>
cd Aeternum-Ally
cp .env.example .env          # then fill in the 5 required vars
npm install
npm run dev:netlify           # Vite + Netlify Functions on http://localhost:8888
```

Full setup (Supabase project, schema, migrations, Netlify deploy) is in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

> ⚠️ Always use `npm run dev:netlify` (not `npm run dev`) when working on API code — the latter does not expose `/.netlify/functions/*`.

---

## 📚 Documentation

*   **[Tech Stack](./docs/TECH_STACK.md)** — Architecture, frontend/backend stack, database schema, RLS, security model
*   **[Deployment](./docs/DEPLOYMENT.md)** — Setup, environment variables, deploy flow, schema migrations, local development, troubleshooting

---
## Live Demo
You can try the live version of AeternumAlly at: [demo.aeternumally.com](https://demo.aeternumally.com)

> **Note on AI Usage:** As this is a prototype, we currently have a limited AI quota. If the system is unresponsive or returns a quota error, it might be due to high traffic. We appreciate your patience.

---
## ⚠️ Known Limitations
- **AI Quota:** The live demo uses a shared API quota. During peak times, you may encounter rate limiting.
- **Self-Hosting:** For heavy usage, we recommend self-hosting AeternumAlly and providing your own API keys (refer to [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. 

### Why AGPL?
We believe in open collaboration. If you use this software to provide a network service (SaaS), you must contribute back by making your source code available under the same license. 

For commercial inquiries or alternative licensing, please contact us at [aeternumally.com](https://aeternumally.com).
See [LICENSE](./LICENSE) for the precise terms.

