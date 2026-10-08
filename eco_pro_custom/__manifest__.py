{
    'name': 'Eco Pro Customizations',
    'version': '19.0.1.2.0',
    'category': 'Customizations',
    'summary': 'Centralized module for Eco Pro Plumbing customizations',
    'depends': ['base', 'account', 'sale', 'crm', 'quickbooks_sync_online'],
    'data': [
        'views/res_config_settings_views.xml',
        'views/account_move_views.xml',
        'views/menu_overrides.xml',
        'views/res_partner_views.xml',
        'views/sale_order_note_views.xml',
        'data/res_country_data.xml',
    ],
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
