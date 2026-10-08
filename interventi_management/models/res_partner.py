from odoo import models, fields, api

class ResPartner(models.Model):
    _inherit = 'res.partner'

    intervento_count = fields.Integer(compute='_compute_intervento_count', string='Job Requests Count')

    def _compute_intervento_count(self):
        for partner in self:
            partner.intervento_count = self.env['interventi.intervento'].search_count([('partner_id', '=', partner.id)])

    def action_view_interventi(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Job Requests',
            'view_mode': 'list,form',
            'res_model': 'interventi.intervento',
            'domain': [('partner_id', '=', self.id)],
            'context': {'default_partner_id': self.id},
        }
