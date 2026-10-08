from odoo import api, fields, models

class SaleOrderTemplateLine(models.Model):
    _inherit = 'sale.order.template.line'

    version = fields.Selection([
        ('good', 'Good'),
        ('better', 'Better'),
        ('best', 'Best')
    ], string='Version', default='good', required=True)

class SaleOrderTemplate(models.Model):
    _inherit = 'sale.order.template'

    good_line_ids = fields.One2many(
        'sale.order.template.line', 'sale_order_template_id',
        string="Good Lines", domain=[('version', '=', 'good')]
    )
    better_line_ids = fields.One2many(
        'sale.order.template.line', 'sale_order_template_id',
        string="Better Lines", domain=[('version', '=', 'better')]
    )
    best_line_ids = fields.One2many(
        'sale.order.template.line', 'sale_order_template_id',
        string="Best Lines", domain=[('version', '=', 'best')]
    )
