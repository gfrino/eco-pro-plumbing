{
    "name": "Quick Estimates",
    "version": "1.0",
    "category": "Sales",
    "summary": "Quick Quotation Liquid Glass Dashboard",
    "depends": ["sale_management", "quote_template_versions"],
    "data": [
        "security/ir.model.access.csv",
        "views/quick_quotation_menu.xml",
        "views/sale_order_template_views.xml",
        "wizard/signature_wizard_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "quick_quotation/static/src/quick_quotation_dashboard.js",
            "quick_quotation/static/src/quick_quotation_dashboard.xml",
            "quick_quotation/static/src/quick_quotation_dashboard.scss",
            "quick_quotation/static/src/inline_signature_field.js",
            "quick_quotation/static/src/inline_signature_field.xml",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
