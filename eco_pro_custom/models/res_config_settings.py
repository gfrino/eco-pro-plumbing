from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    cc_fee_percentage = fields.Float(related='company_id.cc_fee_percentage', readonly=False)
    cc_fee_product_id = fields.Many2one(related='company_id.cc_fee_product_id', readonly=False)
