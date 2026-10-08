from odoo import models, fields

class SaleOrderTemplate(models.Model):
    _inherit = 'sale.order.template'

    image_1920 = fields.Image("Display Image", max_width=1920, max_height=1920)
    has_image = fields.Boolean(compute='_compute_has_image', store=False)
    
    good_total = fields.Float(compute='_compute_totals')
    better_total = fields.Float(compute='_compute_totals')
    best_total = fields.Float(compute='_compute_totals')

    def _compute_has_image(self):
        for template in self:
            template.has_image = bool(template.image_1920)

    def _compute_totals(self):
        for template in self:
            totals = {'good': 0.0, 'better': 0.0, 'best': 0.0}
            lines = self.env['sale.order.template.line'].search([
                ('sale_order_template_id', '=', template.id)
            ])
            for line in lines:
                if line.version in totals and line.product_id:
                    price = getattr(line, 'price_unit', False) or line.product_id.lst_price
                    totals[line.version] += (price * line.product_uom_qty)
            
            template.good_total = totals['good']
            template.better_total = totals['better']
            template.best_total = totals['best']
