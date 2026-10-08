from odoo import models, fields, api

class SaleOrder(models.Model):
    _inherit = 'sale.order'

    intervento_ids = fields.One2many('interventi.intervento', 'sale_order_id', string='Job Requests')
    intervento_count = fields.Integer(compute='_compute_intervento_count', string='Job Requests Count')

    @api.depends('intervento_ids')
    def _compute_intervento_count(self):
        for order in self:
            order.intervento_count = len(order.intervento_ids)

    def action_create_intervento(self):
        self.ensure_one()
        if not self.intervento_ids:
            new_intervento = self.env['interventi.intervento'].create({
                'partner_id': self.partner_id.id,
                'sale_order_id': self.id,
                'notes': f"Created from Quotation {self.name}",
            })
            return {
                'type': 'ir.actions.act_window',
                'name': 'Job Request',
                'res_model': 'interventi.intervento',
                'view_mode': 'form',
                'views': [(False, 'form')],
                'res_id': new_intervento.id,
            }

    def action_view_interventi(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Job Requests',
            'res_model': 'interventi.intervento',
            'domain': [('sale_order_id', '=', self.id)],
            'view_mode': 'list,form',
            'context': {
                'default_sale_order_id': self.id, 
                'default_partner_id': self.partner_id.id
            },
        }

    def action_confirm(self):
        res = super(SaleOrder, self).action_confirm()
        for order in self:
            if not order.intervento_ids:
                order.action_create_intervento()
        return res
