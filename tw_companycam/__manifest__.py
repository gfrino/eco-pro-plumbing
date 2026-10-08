# -*- coding: utf-8 -*-
{
    'name': 'CompanyCam',
    'summary': 'Job-site photo & video capture: live camera, GPS/time stamps, '
               'tags, markup, project feed, shareable galleries and timelines, QR codes',
    'description': """
CompanyCam for Odoo
===================

Capture and organise job-site photos and videos directly inside Odoo projects.

* Full-screen camera (photo, video and dual front+back video) that works in any
  modern browser on phones, tablets and laptops, with upload from the device as fallback.
* Every capture is stamped with date, time, user and GPS location.
* Captures taken without signal are kept on the device and uploaded automatically
  when the connection is back.
* Tags (Before, After, Damage...) to organise photos within and across projects;
  project tags act as labels / search filters.
* Markup editor: draw, arrows, shapes and text on photos. The original is always kept.
* Project feed with the latest activity of the whole team.
* Shareable galleries (selected photos) and live project timelines via a public link.
* Printable project QR codes: scan to open the project in Odoo.
* PDF photo reports.

Version History
---------------
* 19.0.1.0.0 - First release.
""",
    'version': '19.0.1.0.0',
    'author': 'ticinoWEB',
    'website': 'https://ticinoweb.tech',
    'maintainer': 'ticinoWEB',
    'support': 'gio@ticinoweb.net',
    'category': 'Services/Project',
    'depends': ['project', 'mail', 'portal'],
    'data': [
        'security/companycam_security.xml',
        'security/ir.model.access.csv',
        'data/companycam_tag_data.xml',
        'views/companycam_photo_views.xml',
        'views/companycam_tag_views.xml',
        'views/companycam_gallery_views.xml',
        'views/project_project_views.xml',
        'views/companycam_actions.xml',
        'views/companycam_menus.xml',
        'views/companycam_public_templates.xml',
        'report/companycam_reports.xml',
        'report/companycam_report_templates.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'tw_companycam/static/src/backend/**/*',
        ],
        # Small standalone bundle for the public share pages (no website needed)
        'tw_companycam.assets_public': [
            'web/static/src/libs/fontawesome/css/font-awesome.css',
            'tw_companycam/static/src/public/**/*',
        ],
    },
    'images': ['static/description/icon.png'],
    'application': True,
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
