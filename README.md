# Eco Pro Plumbing – Odoo 19 modules

Custom Odoo 19 modules for Eco Pro Plumbing, by ticinoWEB.
Every folder at the repository root is an Odoo module, so the repository can be
added as-is to the Odoo `addons_path`.

## Modules

| Module | Version | Description |
| --- | --- | --- |
| [`tw_companycam`](tw_companycam) | 19.0.1.3.0 | **CompanyCam** – job-site photo & video capture inside Odoo projects |
| [`eco_pro_custom`](eco_pro_custom) | 19.0.1.3.0 | **Eco Pro Customizations** – Job Location / EIN labels, credit-card fee, "Estimates" menu, marketing tab on contacts (pre-filled on quotations), formatted quotation notes |
| [`interventi_management`](interventi_management) | 19.0.1.2.0 | **Job Requests** – plan job requests quickly from contacts |
| [`quick_quotation`](quick_quotation) | 1.0 | **Quick Estimates** – dashboard to build estimates fast from Good/Better/Best templates |
| [`quote_template_versions`](quote_template_versions) | 1.0 | **Quote Template Versions** – Good, Better, Best versions in quotation templates |
| [`quickbooks_sync_online_import_history`](quickbooks_sync_online_import_history) | 19.0.1.0.0 | **QuickBooks Import History** – imports historical invoices from QuickBooks (proof of concept) |

### Third-party modules (not in this repository)

Installed on the server in `/mnt/extra-addons` but not published here:

- `quickbooks_sync_online` – VentorTech QuickBooks Online Connector PRO (paid, OPL-1 licence: must not be redistributed).
- `integration_queue_job` – VentorTech / OCA queue job, required by the connector (available from its vendor).

`quickbooks_sync_online_import_history` and `eco_pro_custom` depend on `quickbooks_sync_online`.

### tw_companycam – CompanyCam

Capture and organise job-site photos and videos directly inside Odoo projects
(depends on `project`, `mail`, `portal`).

- Full-screen browser camera for phones, tablets and laptops: photo, video and
  dual (back + front) video, plus upload from the device.
- Every capture is stamped with project, date, time, user and GPS location.
- Captures taken without a connection stay on the device and upload automatically
  when the connection is back (no duplicates).
- Tags (Before, In progress, After, Damage, Materials, Safety) chosen before shooting.
- Markup editor (draw, arrows, boxes, circles, text); the original photo is always kept.
- Project Feed with the latest activity of the whole team, and a full-screen viewer.
- Shareable galleries and a live project timeline via a public link (noindex).
- Printable project QR codes and PDF photo reports.
- Translations: English, Italian.

Menu: **CompanyCam** (Feed, Camera, Projects, Photos and videos, Shared, Configuration).
Access groups: *CompanyCam / User* (users delete only their own captures) and
*CompanyCam / Administrator*.

> The camera needs HTTPS (or localhost) to be allowed by the browser.

## Installation

1. Add this repository to the Odoo `addons_path`.
2. Update the apps list and install **CompanyCam** (`tw_companycam`).

## Changelog

- **interventi_management 19.0.1.2.0** – Job Requests get the chatter (attachments, notes, activities, status change log): technicians and office staff could not attach photos or documents to a job.
- **tw_companycam 19.0.1.3.0** – iPhone: preview painted on a canvas from the camera frames,
  because Safari could play the camera video without showing it; blur effects over it removed.
- **tw_companycam 19.0.1.2.0** – iPhone: black camera preview fixed (iOS Safari video setup,
  automatic restart after a capture or when returning to the app, tap-to-start fallback).
- **tw_companycam 19.0.1.1.0** – Project is optional: the camera opens straight away and photos
  can be filed in a project later (filter *Without project*), so a quick shot is never blocked.
- **tw_companycam 19.0.1.0.0** – First release.
- **eco_pro_custom 19.0.1.3.0** – Marketing fields in their own contact tab; quotations pre-fill Source / Medium / Campaign / Referred By from the customer: enter the origin once, reuse it on every sale.
- **eco_pro_custom 19.0.1.2.0** – Formatted (rich-text) note lines in quotations, shown on PDF and portal: the client needs highlighted notes between products.
- **eco_pro_custom 19.0.1.1.0** – Campaign / Medium / Source / Referred By on contacts, filled from the lead and copied to new quotations: see where each customer comes from without opening leads.
- **2026-10-08** – Imported `eco_pro_custom`, `interventi_management`, `quick_quotation`, `quote_template_versions`, `quickbooks_sync_online_import_history` as they run on the production server, so GitHub is the source of truth.
