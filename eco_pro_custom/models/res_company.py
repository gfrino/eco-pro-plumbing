from odoo import models, fields

class ResCompany(models.Model):
    _inherit = 'res.company'

    cc_fee_percentage = fields.Float(string="Credit Card Fee (%)", default=3.0)
    cc_fee_product_id = fields.Many2one('product.product', string="Credit Card Fee Product")
