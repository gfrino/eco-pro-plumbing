from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    cc_fee_percentage = fields.Float(related='company_id.cc_fee_percentage', readonly=False)
    cc_fee_product_id = fields.Many2one(related='company_id.cc_fee_product_id', readonly=False)
    qbo_health_alert_email = fields.Char(
        string="QuickBooks alert e-mail",
        config_parameter='eco_pro_custom.qbo_health.alert_email',
        help="Address notified every hour the QuickBooks sync is broken "
             "(expired tokens, failed jobs, stuck queue). Several addresses separated by comma.",
    )
