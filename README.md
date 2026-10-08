# Eco Pro Plumbing – Odoo 19 modules

Custom Odoo 19 modules for Eco Pro Plumbing, by ticinoWEB.
Every folder at the repository root is an Odoo module, so the repository can be
added as-is to the Odoo `addons_path`.

## Modules

| Module | Version | Description |
| --- | --- | --- |
| [`tw_companycam`](tw_companycam) | 19.0.1.0.0 | **CompanyCam** – job-site photo & video capture inside Odoo projects |

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

- **tw_companycam 19.0.1.0.0** – First release.
