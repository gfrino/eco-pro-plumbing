# Eco Pro Customizations

Centralized module for Eco Pro Plumbing customizations in Odoo.

## Features
- **Job Location Terminology:** Renames "Delivery" and "Shipping Address" to "Job Location" across partner contacts and PDF invoice reports.
- **Credit Card Fees:** Adds a one-click button inside draft invoices to automatically calculate and append a 3.0% (configurable) Credit Card Fee line.
- **EIN Terminology:** Changes "VAT" and "Tax ID" labels to "EIN" dynamically for US-based records and updates company header details.
- **Customer Marketing Origin (19.0.1.1.0):** Campaign, Medium, Source and Referred By on the contact (Sales & Purchase tab → Marketing). Filled automatically from the customer's lead (only empty values, the first lead wins), copied to new quotations, filterable/groupable in Contacts. Upgrading fills existing contacts from their oldest lead. Why: know where each customer comes from without opening the leads.
- **Formatted notes in quotations (19.0.1.2.0):** note lines ("Add a note") can be formatted — bold, colours, size, lists, links — via the brush button on the note line. The formatting shows on the quotation PDF and the customer portal. The plain text is kept in step for invoices and search; editing the note text directly in the list replaces the formatting. Why: the client needs highlighted notes between products.
- **Marketing tab + quotation pre-fill (19.0.1.3.0):** the marketing fields moved to their own "Marketing" tab on the contact; choosing a customer on a quotation pre-fills Source, Medium, Campaign and Referred By (new field on the quotation, Other Info → Tracking). Why: the client wants the origin entered once on the contact and reused on every sale.
