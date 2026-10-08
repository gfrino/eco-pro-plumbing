{
    "name": "Job Requests",
    "version": "19.0.1.2.0",
    "category": "Services/Job Requests",
    "summary": "Pianifica job requests rapidamente dai contatti",
    "depends": ["base", "mail", "contacts", "quick_quotation", "sale"],
    "data": [
        "security/ir.model.access.csv",
        "views/intervento_views.xml",
        "wizard/create_intervento_wizard_views.xml",
        "views/res_partner_views.xml",
        "views/interventi_menu.xml",
        "views/sale_order_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            'interventi_management/static/src/xml/calendar_event.xml',
            "interventi_management/static/src/css/interventi_statusbar.css",
            "interventi_management/static/src/liquid_gantt.scss",
            "interventi_management/static/src/liquid_gantt.js",
            "interventi_management/static/src/liquid_gantt.xml",
            "interventi_management/static/src/control_panel_patch.xml",
        ],
    },
    "installable": True,
    "application": True,
}
